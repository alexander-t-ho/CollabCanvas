import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { doc, setDoc, deleteDoc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { CanvasObject } from '../types';
import { generateId } from '../utils/helpers';
import { useAuth } from './AuthContext';
import {
  CommandHistory,
  AddObjectCommand,
  DeleteObjectCommand,
  UpdateObjectCommand,
  UpdateMultipleObjectsCommand,
  CreateGroupCommand
} from '../utils/commands';

const CANVAS_ID = 'default';

interface CanvasContextType {
  objects: CanvasObject[];
  selectedId: string | null;
  selectedIds: string[];
  drawingMode: 'none' | 'line';
  tempLineStart: { x: number; y: number } | null;
  canUndo: boolean;
  canRedo: boolean;
  addObject: (object: Omit<CanvasObject, 'id' | 'createdAt' | 'lastModified'>) => Promise<void>;
  updateObject: (id: string, updates: Partial<CanvasObject>) => Promise<void>;
  updateObjectLive: (id: string, updates: Partial<CanvasObject>) => void;
  deleteObject: (id: string) => Promise<void>;
  selectObject: (id: string | null) => void;
  selectMultiple: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  createGroup: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  exportCanvasAsPNG: (stage: any) => void;
  setObjects: (objects: CanvasObject[]) => void;
  setDrawingMode: (mode: 'none' | 'line') => void;
  setTempLineStart: (point: { x: number; y: number } | null) => void;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

export const useCanvas = () => {
  const context = useContext(CanvasContext);
  if (!context) throw new Error('useCanvas must be used within CanvasProvider');
  return context;
};

export const CanvasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [objects, setObjectsState] = useState<CanvasObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [drawingMode, setDrawingMode] = useState<'none' | 'line'>('none');
  const [tempLineStart, setTempLineStart] = useState<{ x: number; y: number } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const commandHistoryRef = useRef<CommandHistory>(new CommandHistory());
  const isExecutingCommandRef = useRef(false);
  const objectsRef = useRef<CanvasObject[]>([]); // Keep ref in sync with state for synchronous access
  const { currentUser } = useAuth();

  // Helper function to remove undefined values (Firestore doesn't accept undefined)
  const removeUndefinedValues = useCallback((obj: any): any => {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => removeUndefinedValues(item));
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
          cleaned[key] = removeUndefinedValues(obj[key]);
        }
      }
      return cleaned;
    }
    
    return obj;
  }, []);

  // Helper functions for Firestore operations (used by commands)
  const addToFirestore = useCallback(async (obj: CanvasObject) => {
    const objectRef = doc(db, 'canvases', CANVAS_ID, 'objects', obj.id);
    // Remove undefined values before saving
    const cleanedObj = removeUndefinedValues(obj);
    await setDoc(objectRef, cleanedObj);
  }, [removeUndefinedValues]);

  const removeFromFirestore = useCallback(async (id: string) => {
    const objectRef = doc(db, 'canvases', CANVAS_ID, 'objects', id);
    await deleteDoc(objectRef);
  }, []);

  const updateInFirestore = useCallback(async (id: string, updates: Partial<CanvasObject>) => {
    const objectRef = doc(db, 'canvases', CANVAS_ID, 'objects', id);
    // Get current object from ref for synchronous access (ref is kept in sync with state)
    const currentObject = objectsRef.current.find(obj => obj.id === id);
    if (currentObject) {
      // Clean updates to remove undefined values before merging
      const cleanedUpdates = removeUndefinedValues(updates);
      // Update Firestore with merged updates, removing undefined values
      const updatedObject = { ...currentObject, ...cleanedUpdates, lastModified: Date.now() };
      const cleanedObj = removeUndefinedValues(updatedObject);
      await setDoc(objectRef, cleanedObj, { merge: true });
    }
  }, [removeUndefinedValues]);

  // Wrapper to update both state and ref synchronously (for commands)
  const updateObjectsState = useCallback((updater: (prev: CanvasObject[]) => CanvasObject[]) => {
    setObjectsState(prev => {
      const next = updater(prev);
      // Update ref synchronously so commands can access current state
      objectsRef.current = next;
      return next;
    });
  }, []);

  // Keep objectsRef in sync with objects state (backup for cases where state changes outside commands)
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  // Update canUndo/canRedo based on command history
  useEffect(() => {
    setCanUndo(commandHistoryRef.current.canUndo());
    setCanRedo(commandHistoryRef.current.canRedo());
  }, [objects]); // Re-check when objects change

  const addObject = useCallback(async (object: Omit<CanvasObject, 'id' | 'createdAt' | 'lastModified'>) => {
    if (!currentUser || isExecutingCommandRef.current) return;
    
    // Ensure required fields are present
    const newObject: CanvasObject = {
      ...object,
      id: generateId(),
      createdAt: Date.now(),
      lastModified: Date.now(),
      width: object.width || 100,
      height: object.height || 100
    };
    
    try {
      // Create and execute command (command will handle local state update)
      const command = new AddObjectCommand(
        newObject, 
        addToFirestore, 
        removeFromFirestore,
        updateObjectsState
      );
      await commandHistoryRef.current.executeCommand(command);
      
      // Update undo/redo state
      setCanUndo(commandHistoryRef.current.canUndo());
      setCanRedo(commandHistoryRef.current.canRedo());
    } catch (error) {
      console.error('❌ ADD_OBJECT Error:', error);
    }
  }, [currentUser, addToFirestore, removeFromFirestore, updateObjectsState]);

  const updateObject = useCallback(async (id: string, updates: Partial<CanvasObject>) => {
    if (!currentUser || isExecutingCommandRef.current) return;
    
    const existingObject = objects.find(obj => obj.id === id);
    if (!existingObject) return;
    
    // Store previous state for undo
    const previousState: Partial<CanvasObject> = {};
    Object.keys(updates).forEach(key => {
      (previousState as any)[key] = (existingObject as any)[key];
    });
    
    try {
      // Create and execute command (command will handle local state update)
      const command = new UpdateObjectCommand(
        id, 
        updates, 
        previousState, 
        updateInFirestore,
        updateObjectsState,
        () => objects.find(obj => obj.id === id)
      );
      await commandHistoryRef.current.executeCommand(command);
      
      // Update undo/redo state
      setCanUndo(commandHistoryRef.current.canUndo());
      setCanRedo(commandHistoryRef.current.canRedo());
    } catch (error) {
      console.error('Error updating object:', error);
    }
  }, [currentUser, objects, updateInFirestore, updateObjectsState]);

  // For real-time dragging updates - only updates local state, no Firestore
  const updateObjectLive = useCallback((id: string, updates: Partial<CanvasObject>) => {
    setObjectsState(prev => 
      prev.map(obj => 
        obj.id === id ? { ...obj, ...updates } : obj
      )
    );
  }, []);

  const deleteObject = useCallback(async (id: string) => {
    if (!currentUser || isExecutingCommandRef.current) return;
    
    const objectToDelete = objects.find(obj => obj.id === id);
    if (!objectToDelete) return;
    
    try {
      if (selectedId === id) setSelectedId(null);
      
      // Create and execute command (command will handle local state update)
      const command = new DeleteObjectCommand(
        objectToDelete, 
        removeFromFirestore, 
        addToFirestore,
        updateObjectsState
      );
      await commandHistoryRef.current.executeCommand(command);
      
      // Update undo/redo state
      setCanUndo(commandHistoryRef.current.canUndo());
      setCanRedo(commandHistoryRef.current.canRedo());
    } catch (error) {
      console.error('❌ DELETE Error:', error);
    }
  }, [currentUser, objects, selectedId, removeFromFirestore, addToFirestore, updateObjectsState]);

  const selectObject = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  }, []);

  const selectMultiple = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    setSelectedId(ids.length === 1 ? ids[0] : null);
  }, []);

  const addToSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev;
      const newSelection = [...prev, id];
      setSelectedId(newSelection.length === 1 ? newSelection[0] : null);
      return newSelection;
    });
  }, []);

  const removeFromSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSelection = prev.filter(selectedId => selectedId !== id);
      setSelectedId(newSelection.length === 1 ? newSelection[0] : null);
      return newSelection;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedIds([]);
  }, []);

  const createGroup = useCallback(async () => {
    if (!currentUser || selectedIds.length < 2) return;

    const selectedObjects = objects.filter(obj => selectedIds.includes(obj.id));
    
    // Calculate bounds of all objects
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedObjects.forEach(obj => {
      if (obj.type === 'line') {
        // For lines, check both start and end points
        minX = Math.min(minX, obj.x, obj.x2 || obj.x);
        minY = Math.min(minY, obj.y, obj.y2 || obj.y);
        maxX = Math.max(maxX, obj.x, obj.x2 || obj.x);
        maxY = Math.max(maxY, obj.y, obj.y2 || obj.y);
      } else if (obj.type === 'circle') {
        // For circles, x,y is center, radius is width/2
        const radius = obj.width / 2;
        minX = Math.min(minX, obj.x - radius);
        minY = Math.min(minY, obj.y - radius);
        maxX = Math.max(maxX, obj.x + radius);
        maxY = Math.max(maxY, obj.y + radius);
      } else {
        // For rectangles, images, text: x,y is center (due to offset)
        const halfWidth = obj.width / 2;
        const halfHeight = obj.height / 2;
        minX = Math.min(minX, obj.x - halfWidth);
        minY = Math.min(minY, obj.y - halfHeight);
        maxX = Math.max(maxX, obj.x + halfWidth);
        maxY = Math.max(maxY, obj.y + halfHeight);
      }
    });
    
    // Add padding
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Calculate width, height, and TRUE center from the bounds
    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = minX + (width / 2);
    const centerY = minY + (height / 2);

    const groupObject: Omit<CanvasObject, 'id' | 'createdAt' | 'lastModified'> = {
      type: 'group',
      x: centerX,
      y: centerY,
      width: width,
      height: height,
      fill: '#000000',
      groupedObjects: [...selectedIds],
      nickname: `Group of ${selectedIds.length}`,
      zIndex: Math.max(...selectedObjects.map(obj => obj.zIndex || 0)) + 1,
      shadow: false,
      createdBy: currentUser.uid,
    };

    // Create the group object with proper ID
    const newGroupObject: CanvasObject = {
      ...groupObject,
      id: generateId(),
      createdAt: Date.now(),
      lastModified: Date.now(),
    };

    try {
      // Create and execute command (command will handle local state update)
      const command = new CreateGroupCommand(
        newGroupObject,
        selectedIds,
        addToFirestore,
        removeFromFirestore,
        updateObjectsState
      );
      await commandHistoryRef.current.executeCommand(command);
      
      // Update undo/redo state
      setCanUndo(commandHistoryRef.current.canUndo());
      setCanRedo(commandHistoryRef.current.canRedo());
      
      clearSelection();
    } catch (error) {
      console.error('❌ CREATE_GROUP Error:', error);
    }
  }, [currentUser, selectedIds, objects, addToFirestore, removeFromFirestore, clearSelection]);

  const setObjects = useCallback((newObjects: CanvasObject[]) => {
    // Skip updates during command execution to prevent bouncing
    if (isExecutingCommandRef.current) {
      console.log('⏸️ REALTIME SYNC: Skipping update during command execution');
      return;
    }
    
    setObjectsState(prev => {
      const prevJson = JSON.stringify(prev);
      const newJson = JSON.stringify(newObjects);
      
      if (prevJson === newJson) return prev;
      
      console.log('🔄 REALTIME SYNC: Updating objects from Firestore');
      
      // DON'T save to history from realtime sync - only save from user actions
      // This prevents the undo-redo loop
      
      // Keep ref in sync with state
      objectsRef.current = newObjects;
      
      return newObjects;
    });
  }, []);

  // Listen to Firestore objects collection for real-time sync
  useEffect(() => {
    if (!currentUser) {
      setObjectsState([]);
      return;
    }

    console.log('📡 Setting up Firestore listener for objects');
    const objectsRef = collection(db, 'canvases', CANVAS_ID, 'objects');
    
    const unsubscribe = onSnapshot(objectsRef, (snapshot) => {
      const firestoreObjects: CanvasObject[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        firestoreObjects.push(data as CanvasObject);
      });
      
      console.log('📥 Firestore sync: Received', firestoreObjects.length, 'objects');
      
      // Update local state using setObjects which handles the sync logic
      setObjects(firestoreObjects);
    }, (error) => {
      console.error('❌ Firestore listener error:', error);
    });

    return () => {
      console.log('📡 Unsubscribing from Firestore listener');
      unsubscribe();
    };
  }, [currentUser, setObjects]);

  // Undo function - command-based
  const undo = useCallback(async () => {
    if (isExecutingCommandRef.current) {
      console.log('⏸️ UNDO: Already executing a command');
      return;
    }
    
    if (!commandHistoryRef.current.canUndo()) {
      console.log('⚠️ UNDO: No commands to undo');
      return;
    }
    
    try {
      isExecutingCommandRef.current = true;
      console.log('🔄 UNDO: Executing undo...');
      const success = await commandHistoryRef.current.undo();
      
      if (success) {
        console.log('✅ UNDO: Success');
        setCanUndo(commandHistoryRef.current.canUndo());
        setCanRedo(commandHistoryRef.current.canRedo());
        clearSelection();
      } else {
        console.log('⚠️ UNDO: Command returned false');
      }
    } catch (error) {
      console.error('❌ UNDO Error:', error);
    } finally {
      isExecutingCommandRef.current = false;
    }
  }, [clearSelection]);

  // Redo function - command-based
  const redo = useCallback(async () => {
    if (isExecutingCommandRef.current) {
      console.log('⏸️ REDO: Already executing a command');
      return;
    }
    
    if (!commandHistoryRef.current.canRedo()) {
      console.log('⚠️ REDO: No commands to redo');
      return;
    }
    
    try {
      isExecutingCommandRef.current = true;
      console.log('🔄 REDO: Executing redo...');
      const success = await commandHistoryRef.current.redo();
      
      if (success) {
        console.log('✅ REDO: Success');
        setCanUndo(commandHistoryRef.current.canUndo());
        setCanRedo(commandHistoryRef.current.canRedo());
        clearSelection();
      } else {
        console.log('⚠️ REDO: Command returned false');
      }
    } catch (error) {
      console.error('❌ REDO Error:', error);
    } finally {
      isExecutingCommandRef.current = false;
    }
  }, [clearSelection]);

  // Export canvas as PNG
  const exportCanvasAsPNG = useCallback((stage: any) => {
    if (!stage) return;
    
    try {
      // Get the stage's current state
      const oldScale = stage.scaleX();
      const oldPosition = { x: stage.x(), y: stage.y() };
      
      // Calculate bounding box of all objects
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      objects.forEach(obj => {
        if (obj.type === 'group') return; // Skip group containers
        
        const objMinX = obj.x - (obj.width || 0) / 2;
        const objMinY = obj.y - (obj.height || 0) / 2;
        const objMaxX = obj.x + (obj.width || 0) / 2;
        const objMaxY = obj.y + (obj.height || 0) / 2;
        
        minX = Math.min(minX, objMinX);
        minY = Math.min(minY, objMinY);
        maxX = Math.max(maxX, objMaxX);
        maxY = Math.max(maxY, objMaxY);
      });
      
      // Add padding
      const padding = 50;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      
      // If no objects, use default canvas size
      if (!isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = 1920;
        maxY = 1080;
      }
      
      const width = maxX - minX;
      const height = maxY - minY;
      
      // Create a temporary canvas with white background
      const canvas = document.createElement('canvas');
      canvas.width = width * 2; // 2x for high DPI
      canvas.height = height * 2;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Fill with white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Temporarily reset stage position and scale for export
        stage.scale({ x: 1, y: 1 });
        stage.position({ x: -minX, y: -minY });
        
        // Export stage to data URL
        const stageDataURL = stage.toDataURL({
          pixelRatio: 2, // Higher quality
          mimeType: 'image/png',
          x: 0,
          y: 0,
          width: width,
          height: height
        });
        
        // Restore original position and scale
        stage.scale({ x: oldScale, y: oldScale });
        stage.position(oldPosition);
        
        // Draw the stage image on top of white background
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          
          // Get final data URL with white background
          const finalDataURL = canvas.toDataURL('image/png');
          
          // Download the image
          const link = document.createElement('a');
          link.download = `collabcanvas-${Date.now()}.png`;
          link.href = finalDataURL;
          link.click();
        };
        img.src = stageDataURL;
      } else {
        // Fallback: restore original position and scale
        stage.scale({ x: oldScale, y: oldScale });
        stage.position(oldPosition);
        throw new Error('Could not get canvas context');
      }
    } catch (error) {
      console.error('Error exporting canvas:', error);
      alert('Failed to export canvas. Please try again.');
    }
  }, [objects]);


  const value = {
    objects,
    selectedId,
    selectedIds,
    drawingMode,
    tempLineStart,
    canUndo,
    canRedo,
    addObject,
    updateObject,
    updateObjectLive,
    deleteObject,
    selectObject,
    selectMultiple,
    addToSelection,
    removeFromSelection,
    clearSelection,
    createGroup,
    undo,
    redo,
    exportCanvasAsPNG,
    setObjects,
    setDrawingMode,
    setTempLineStart
  };

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
};