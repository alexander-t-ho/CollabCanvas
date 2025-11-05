import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useMessageSync } from '../../hooks/useMessageSync';
import { processAICommand, processAICommandWithImage, AICommandResult } from '../../services/aiService';
import { useCanvas } from '../../contexts/CanvasContext';
import { useAuth } from '../../contexts/AuthContext';
import { CanvasObject } from '../../types';

const CANVAS_ID = 'default';

const ChatWindow: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isAIMode, setIsAIMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<AICommandResult | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true); // Toggle for AI suggestions
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { messages, loading, sendMessage } = useMessageSync();
  const { objects, addObject, updateObject, deleteObject, selectMultiple } = useCanvas();
  const { currentUser } = useAuth();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Detect scroll position to show/hide scroll button
  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setShowScrollButton(!isNearBottom);
    }
  };

  // Scroll to bottom function
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Clear chat function
  const handleClearChat = async () => {
    if (!window.confirm('Are you sure you want to clear the chat history? This cannot be undone.')) {
      return;
    }
    
    try {
      const messagesRef = collection(db, 'canvases', CANVAS_ID, 'messages');
      const snapshot = await getDocs(messagesRef);
      
      // Delete all messages
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      console.log('Chat cleared successfully');
    } catch (error) {
      console.error('Error clearing chat:', error);
      alert('Failed to clear chat. Please try again.');
    }
  };

  // Handle image upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 4MB for OpenAI)
    if (file.size > 4 * 1024 * 1024) {
      alert('Image must be smaller than 4MB');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setUploadedImage(base64);
      setInputValue('Recreate this design on the canvas');
    };
    reader.readAsDataURL(file);
  };

  const executeAIActions = async (result: AICommandResult) => {
    if (!currentUser) return;

    const totalActions = result.actions.length;
    
    for (let i = 0; i < result.actions.length; i++) {
      const action = result.actions[i];
      
      // Update progress
      const progressPercent = Math.round(((i + 1) / totalActions) * 100);
      setProgress(progressPercent);
      setLoadingStatus(`Creating object ${i + 1} of ${totalActions}...`);
      
      try {
        switch (action.type) {
          case 'createShape':
            await addObject({
              type: action.data.type,
              x: action.data.x,
              y: action.data.y,
              width: action.data.width,
              height: action.data.height,
              fill: action.data.color,
              nickname: '',
              cornerRadius: action.data.type === 'rectangle' ? 5 : 0,
              zIndex: objects.length,
              shadow: false,
              createdBy: currentUser.uid
            });
            break;

          case 'createLine':
            // Create a line (straight or curved)
            const x1 = action.data.x1;
            const y1 = action.data.y1;
            const x2 = action.data.x2;
            const y2 = action.data.y2;
            const curved = action.data.curved || false;
            const curvature = action.data.curvature || 0;
            
            // Calculate line length
            const lineLength = Math.sqrt(
              Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)
            );
            
            // Calculate control point based on curvature
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            
            // Perpendicular offset for curvature
            const dx = x2 - x1;
            const dy = y2 - y1;
            const perpX = -dy;
            const perpY = dx;
            const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
            const normalizedPerpX = perpX / perpLength;
            const normalizedPerpY = perpY / perpLength;
            
            const controlX = midX + normalizedPerpX * curvature;
            const controlY = midY + normalizedPerpY * curvature;
            
            await addObject({
              type: 'line',
              x: x1,
              y: y1,
              x2: x2,
              y2: y2,
              width: lineLength,
              height: 0,
              controlX: curved ? controlX : midX,
              controlY: curved ? controlY : midY,
              curved: curved,
              fill: action.data.color || '#' + Math.floor(Math.random() * 16777215).toString(16),
              strokeWidth: action.data.strokeWidth || 3,
              nickname: '',
              zIndex: objects.length,
              shadow: false,
              createdBy: currentUser.uid
            });
            break;

          case 'createButton':
            // Create button background
            await addObject({
              type: 'rectangle',
              x: action.data.x,
              y: action.data.y,
              width: action.data.width || 200,
              height: action.data.height || 50,
              fill: action.data.color || '#3b82f6',
              nickname: `${action.data.text} Button`,
              cornerRadius: 8,
              zIndex: objects.length,
              shadow: true,
              createdBy: currentUser.uid
            });
            
            // Create button text
            await addObject({
              type: 'text',
              x: action.data.x,
              y: action.data.y,
              width: (action.data.width || 200) - 20,
              height: 30,
              fill: action.data.textColor || '#ffffff',
              text: action.data.text,
              fontSize: 16,
              fontFamily: 'Arial',
              fontStyle: 'bold',
              textAlign: 'center',
              nickname: `${action.data.text} Button Text`,
              zIndex: objects.length + 1,
              shadow: false,
              createdBy: currentUser.uid
            });
            break;

          case 'createText':
            await addObject({
              type: 'text',
              x: action.data.x,
              y: action.data.y,
              width: 200,
              height: 50,
              fill: action.data.color || '#000000',
              text: action.data.text,
              fontSize: action.data.fontSize || 24,
              fontFamily: 'Arial',
              fontStyle: 'normal',
              textAlign: 'left',
              nickname: '',
              zIndex: objects.length,
              shadow: false,
              createdBy: currentUser.uid
            });
            break;

          case 'createPolygon':
            // Create a polygon (triangle, pentagon, hexagon, etc.)
            const sides = action.data.sides || 3;
            const sideLength = action.data.sideLength || (sides === 3 ? 120 : 100);
            const polygonX = action.data.x || 0;
            const polygonY = action.data.y || 0;
            const polygonColor = action.data.color || '#3b82f6';
            
            // Calculate bounding box for polygon
            // For regular polygons, the radius from center to vertex is:
            // radius = sideLength / (2 * sin(π / sides))
            const radius = sideLength / (2 * Math.sin(Math.PI / sides));
            const boundingSize = radius * 2;
            
            await addObject({
              type: 'polygon',
              x: polygonX,
              y: polygonY,
              width: action.data.width || boundingSize,
              height: action.data.height || boundingSize,
              fill: polygonColor,
              sides: sides,
              sideLength: sideLength,
              nickname: sides === 3 ? 'Triangle' : `${sides}-sided Polygon`,
              zIndex: objects.length,
              shadow: false,
              createdBy: currentUser.uid
            });
            break;

          case 'moveShape':
            const moveObj = objects.find(obj => {
              const identifier = action.data.identifier.toLowerCase();
              const objType = obj.type?.toLowerCase();
              const objNickname = obj.nickname?.toLowerCase();
              const objText = obj.text?.toLowerCase();
              
              // Match by nickname (highest priority for groups)
              if (objNickname && identifier.includes(objNickname)) return true;
              
              // Match by type
              if (objType && identifier.includes(objType)) return true;
              
              // Match by text content
              if (objText && identifier.includes(objText)) return true;
              
              return false;
            });
            
            if (moveObj) {
              console.log('Moving object:', moveObj.nickname || moveObj.type, 'to', action.data.x, action.data.y);
              await updateObject(moveObj.id, {
                x: action.data.x,
                y: action.data.y
              });
              
              // If it's a group, also move all grouped objects
              if (moveObj.type === 'group' && moveObj.groupedObjects) {
                const deltaX = action.data.x - moveObj.x;
                const deltaY = action.data.y - moveObj.y;
                console.log('Moving grouped objects by delta:', deltaX, deltaY);
                
                for (const groupedId of moveObj.groupedObjects) {
                  const groupedObj = objects.find(o => o.id === groupedId);
                  if (groupedObj) {
                    await updateObject(groupedId, {
                      x: groupedObj.x + deltaX,
                      y: groupedObj.y + deltaY
                    });
                  }
                }
              }
            } else {
              console.log('Could not find object to move:', action.data.identifier);
            }
            break;

          case 'modifyText':
            const textObj = objects.find(obj => {
              const identifier = action.data.identifier.toLowerCase();
              const objNickname = obj.nickname?.toLowerCase();
              const objText = obj.text?.toLowerCase();
              
              // Only match text objects
              if (obj.type !== 'text') return false;
              
              // Match by nickname
              if (objNickname && identifier.includes(objNickname)) return true;
              
              // Match by text content
              if (objText && identifier.includes(objText)) return true;
              
              // Match by "the text" if only one text object was recently created
              if (identifier.includes('the text') || identifier === 'it') {
                // Check if this is one of the most recent text objects
                const recentTexts = objects.filter(o => o.type === 'text').slice(-3);
                return recentTexts.some(t => t.id === obj.id);
              }
              
              return false;
            });
            
            if (textObj) {
              const updates: any = {};
              
              if (action.data.fontSize !== undefined) {
                updates.fontSize = action.data.fontSize;
              }
              if (action.data.color !== undefined) {
                updates.fill = action.data.color;
              }
              if (action.data.text !== undefined) {
                updates.text = action.data.text;
              }
              
              console.log('Modifying text:', textObj.nickname || textObj.text, 'with', updates);
              await updateObject(textObj.id, updates);
            } else {
              console.log('Could not find text to modify:', action.data.identifier);
            }
            break;

          case 'resizeShape':
            const resizeObj = objects.find(obj => {
              const identifier = action.data.identifier.toLowerCase();
              const objType = obj.type?.toLowerCase();
              const objNickname = obj.nickname?.toLowerCase();
              const objColor = obj.fill?.toLowerCase();
              const objText = obj.text?.toLowerCase();
              
              // Match by nickname (highest priority)
              if (objNickname && identifier.includes(objNickname)) return true;
              
              // Match by type (circle, rectangle, etc.)
              if (objType && identifier.includes(objType)) return true;
              
              // Match by color name
              const colorMap: { [key: string]: string } = {
                'red': '#ff0000', 'blue': '#0000ff', 'green': '#00ff00',
                'yellow': '#ffff00', 'purple': '#800080', 'orange': '#ffa500',
                'black': '#000000', 'white': '#ffffff', 'gray': '#808080', 'grey': '#808080',
                'pink': '#ffc0cb'
              };
              for (const [colorName, colorHex] of Object.entries(colorMap)) {
                if (identifier.includes(colorName) && objColor === colorHex.toLowerCase()) {
                  // Also check if type matches (e.g., "blue circle")
                  if (objType && identifier.includes(objType)) return true;
                  // Or just color match if no type specified
                  if (!identifier.includes('circle') && !identifier.includes('rectangle') && !identifier.includes('text')) return true;
                }
              }
              
              // Match by text content
              if (objText && identifier.includes(objText)) return true;
              
              return false;
            });
            
            if (resizeObj) {
              console.log('Resizing object:', resizeObj, 'to', action.data.width, 'x', action.data.height);
              await updateObject(resizeObj.id, {
                width: action.data.width,
                height: action.data.height
              });
            } else {
              console.log('Could not find object to resize:', action.data.identifier, 'in', objects);
            }
            break;

          case 'rotateShape':
            const rotateObj = objects.find(obj => {
              const identifier = action.data.identifier.toLowerCase();
              const objType = obj.type?.toLowerCase();
              const objNickname = obj.nickname?.toLowerCase();
              const objText = obj.text?.toLowerCase();
              
              // Match by nickname (highest priority for groups)
              if (objNickname && identifier.includes(objNickname)) return true;
              
              // Match by type
              if (objType && identifier.includes(objType)) return true;
              
              // Match by text content
              if (objText && identifier.includes(objText)) return true;
              
              return false;
            });
            
            if (rotateObj) {
              console.log('Rotating object:', rotateObj.nickname || rotateObj.type, 'to', action.data.degrees, 'degrees');
              await updateObject(rotateObj.id, {
                rotation: action.data.degrees
              });
              
              // If it's a group, rotate all objects around the group center
              if (rotateObj.type === 'group' && rotateObj.groupedObjects) {
                console.log('Rotating grouped objects around center:', rotateObj.groupedObjects);
                
                const groupCenterX = rotateObj.x;
                const groupCenterY = rotateObj.y;
                const rotationRadians = (action.data.degrees * Math.PI) / 180;
                
                for (const groupedId of rotateObj.groupedObjects) {
                  const groupedObj = objects.find(o => o.id === groupedId);
                  if (groupedObj) {
                    // Calculate position relative to group center
                    const relativeX = groupedObj.x - groupCenterX;
                    const relativeY = groupedObj.y - groupCenterY;
                    
                    // Apply rotation transformation
                    const rotatedX = relativeX * Math.cos(rotationRadians) - relativeY * Math.sin(rotationRadians);
                    const rotatedY = relativeX * Math.sin(rotationRadians) + relativeY * Math.cos(rotationRadians);
                    
                    // Update position and rotation
                    await updateObject(groupedId, {
                      x: groupCenterX + rotatedX,
                      y: groupCenterY + rotatedY,
                      rotation: action.data.degrees
                    });
                  }
                }
              }
            } else {
              console.log('Could not find object to rotate:', action.data.identifier);
            }
            break;

          case 'changeLayer':
            // Use fresh objects array to get current state
            const layerObj = objects.find(obj => {
              const identifier = action.data.identifier.toLowerCase();
              const objType = obj.type?.toLowerCase();
              const objNickname = obj.nickname?.toLowerCase();
              const objText = obj.text?.toLowerCase();
              const objColor = obj.fill?.toLowerCase();
              
              // Match by nickname (highest priority)
              if (objNickname && identifier.includes(objNickname)) return true;
              
              // Match by type
              if (objType && identifier.includes(objType)) return true;
              
              // Match by text content
              if (objText && identifier.includes(objText)) return true;
              
              // Match by color
              const colorMap: { [key: string]: string } = {
                'red': '#ff0000', 'blue': '#0000ff', 'green': '#00ff00',
                'yellow': '#ffff00', 'purple': '#800080', 'orange': '#ffa500',
                'black': '#000000', 'white': '#ffffff', 'gray': '#808080', 
                'grey': '#808080', 'pink': '#ffc0cb'
              };
              for (const [colorName, colorHex] of Object.entries(colorMap)) {
                if (identifier.includes(colorName) && objColor === colorHex.toLowerCase()) {
                  if (objType && identifier.includes(objType)) return true;
                  // Match just by color if specific enough
                  if (!identifier.includes('circle') && !identifier.includes('rectangle') && !identifier.includes('text')) {
                    return true;
                  }
                }
              }
              
              return false;
            });
            
            if (layerObj) {
              const currentZIndex = layerObj.zIndex || 0;
              const maxZIndex = Math.max(...objects.map(obj => obj.zIndex || 0));
              const minZIndex = Math.min(...objects.map(obj => obj.zIndex || 0));
              let newZIndex = currentZIndex;

              console.log(`Layering ${layerObj.type} (${layerObj.fill || layerObj.nickname}) - Current Z: ${currentZIndex}, Max: ${maxZIndex}, Min: ${minZIndex}`);

              switch (action.data.action) {
                case 'front':
                  // Bring to front - set to highest z-index + 1
                  newZIndex = maxZIndex + 1;
                  console.log(`Bringing to front: ${currentZIndex} → ${newZIndex}`);
                  break;
                case 'back':
                  // Send to back - set to lowest z-index - 1
                  newZIndex = minZIndex - 1;
                  console.log(`Sending to back: ${currentZIndex} → ${newZIndex}`);
                  break;
                case 'forward':
                  // Move forward one layer
                  newZIndex = currentZIndex + 1;
                  console.log(`Moving forward: ${currentZIndex} → ${newZIndex}`);
                  break;
                case 'backward':
                  // Move backward one layer
                  newZIndex = currentZIndex - 1;
                  console.log(`Moving backward: ${currentZIndex} → ${newZIndex}`);
                  break;
              }

              await updateObject(layerObj.id, {
                zIndex: newZIndex
              });
              console.log(`✅ Layer updated for ${layerObj.type}`);
            } else {
              console.log('❌ Could not find object to layer:', action.data.identifier);
              console.log('Available objects:', objects.map(o => ({ type: o.type, nickname: o.nickname, color: o.fill })));
            }
            break;

          case 'arrangeShapes':
            // Arrange existing shapes in specified pattern
            let shapesToArrange = objects.filter(obj => {
              // Filter by type if specified
              if (action.data.filterType) {
                const filterType = action.data.filterType.toLowerCase();
                
                // Handle special cases
                if (filterType === 'square') {
                  // Squares are rectangles with equal width and height
                  if (obj.type !== 'rectangle') return false;
                  if (Math.abs(obj.width - obj.height) > 1) return false; // Allow small floating point differences
                } else if (filterType === 'triangle') {
                  // Triangles are 3-sided polygons
                  if (obj.type !== 'polygon') return false;
                  if (obj.sides !== 3) return false;
                } else if (filterType === 'polygon') {
                  // All polygons (3+ sides)
                  if (obj.type !== 'polygon') return false;
                } else {
                  // Direct type match
                  if (obj.type !== filterType) return false;
                }
              } else {
                // If no filter type specified, only arrange rectangles and circles by default
                // (to avoid accidentally moving text, images, etc.)
                if (obj.type !== 'rectangle' && obj.type !== 'circle' && obj.type !== 'polygon' && obj.type !== 'ellipse') {
                  return false;
                }
              }
              
              // Filter by color if specified
              if (action.data.filterColor) {
                const filterColor = action.data.filterColor.toLowerCase();
                const objColor = (obj.fill || '').toLowerCase();
                
                // Color name to hex mapping
                const colorMap: { [key: string]: string } = {
                  'red': '#ff0000', 'blue': '#0000ff', 'green': '#00ff00',
                  'yellow': '#ffff00', 'purple': '#800080', 'orange': '#ffa500',
                  'black': '#000000', 'white': '#ffffff', 'gray': '#808080', 'grey': '#808080',
                  'pink': '#ffc0cb'
                };
                
                // Check if filterColor is a color name
                if (colorMap[filterColor]) {
                  if (objColor !== colorMap[filterColor]) return false;
                } else {
                  // Direct hex match
                  if (objColor !== filterColor) return false;
                }
              }
              
              return true;
            });
            
            // Sort by creation time or current position to maintain order
            shapesToArrange.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            
            if (shapesToArrange.length === 0) {
              console.log('No shapes found matching filter criteria');
              break;
            }
            
            const spacing = action.data.spacing || 200; // Default 200px center-to-center spacing
            const startX = action.data.startX || -200;
            const startY = action.data.startY || 0;

            if (action.data.arrangement === 'horizontal') {
              shapesToArrange.forEach((obj, idx) => {
                updateObject(obj.id, {
                  x: startX + (idx * spacing),
                  y: startY
                });
              });
            } else if (action.data.arrangement === 'vertical') {
              shapesToArrange.forEach((obj, idx) => {
                updateObject(obj.id, {
                  x: startX,
                  y: startY + (idx * spacing)
                });
              });
            } else if (action.data.arrangement === 'grid') {
              const gridSize = Math.ceil(Math.sqrt(shapesToArrange.length));
              shapesToArrange.forEach((obj, idx) => {
                const row = Math.floor(idx / gridSize);
                const col = idx % gridSize;
                updateObject(obj.id, {
                  x: startX + (col * spacing),
                  y: startY + (row * spacing)
                });
              });
            }
            
            console.log(`Arranged ${shapesToArrange.length} shapes (filter: type=${action.data.filterType || 'all'}, color=${action.data.filterColor || 'all'})`);
            break;

          case 'createCustomShape':
            // Create custom complex shapes
            const shapeName = action.data.shapeName.toLowerCase();
            const shapeX = action.data.x || 0;
            const shapeY = action.data.y || 0;
            const shapeScale = action.data.scale || 1;
            const shapeColor = action.data.color || '#3b82f6';
            
            console.log('Creating custom shape:', shapeName, 'at', shapeX, shapeY);
            
            if (shapeName.includes('star')) {
              // Create a star using a polygon with custom vertices
              const starPoints = action.data.points || 5; // Default 5-point star
              const outerRadius = 80 * shapeScale;
              const innerRadius = 35 * shapeScale;
              const totalVertices = starPoints * 2; // Alternating outer and inner points
              
              // Calculate custom vertices for star shape
              const starVertices: Array<{ x: number; y: number }> = [];
              for (let i = 0; i < totalVertices; i++) {
                const angle = (i * Math.PI) / starPoints - Math.PI / 2; // Start from top
                const radius = i % 2 === 0 ? outerRadius : innerRadius; // Alternate between outer and inner
                
                starVertices.push({
                  x: Math.cos(angle) * radius,
                  y: Math.sin(angle) * radius
                });
              }
              
              await addObject({
                type: 'polygon',
                x: shapeX,
                y: shapeY,
                width: outerRadius * 2,
                height: outerRadius * 2,
                fill: shapeColor,
                sides: totalVertices,
                sideLength: 50,
                customVertices: starVertices,
                nickname: `${starPoints}-Point Star`,
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
            } else if (shapeName.includes('cloud')) {
              // Create a cloud using multiple circles
              const cloudNicknames: string[] = [];
              const baseSize = 60 * shapeScale;
              
              // Main body circles
              await addObject({
                type: 'circle',
                x: shapeX - baseSize * 0.8,
                y: shapeY,
                width: baseSize * 1.2,
                height: baseSize * 1.2,
                fill: shapeColor,
                nickname: 'Cloud Left',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              cloudNicknames.push('Cloud Left');
              
              await addObject({
                type: 'circle',
                x: shapeX,
                y: shapeY - baseSize * 0.3,
                width: baseSize * 1.5,
                height: baseSize * 1.5,
                fill: shapeColor,
                nickname: 'Cloud Center',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              cloudNicknames.push('Cloud Center');
              
              await addObject({
                type: 'circle',
                x: shapeX + baseSize * 0.8,
                y: shapeY,
                width: baseSize * 1.2,
                height: baseSize * 1.2,
                fill: shapeColor,
                nickname: 'Cloud Right',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              cloudNicknames.push('Cloud Right');
              
              // Auto-group the cloud
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              try {
                const objectsRef = collection(db, 'canvases', CANVAS_ID, 'objects');
                const snapshot = await getDocs(objectsRef);
                const allObjects: CanvasObject[] = [];
                
                snapshot.forEach((doc) => {
                  const data = doc.data();
                  allObjects.push({ id: doc.id, ...data } as CanvasObject);
                });
                
                const foundObjects = allObjects.filter(obj => cloudNicknames.includes(obj.nickname || ''));
                
                if (foundObjects.length >= 2) {
                  const objectIds = foundObjects.map(o => o.id);
                  const minX = Math.min(...foundObjects.map(obj => obj.x - (obj.width || 0) / 2));
                  const maxX = Math.max(...foundObjects.map(obj => obj.x + (obj.width || 0) / 2));
                  const minY = Math.min(...foundObjects.map(obj => obj.y - (obj.height || 0) / 2));
                  const maxY = Math.max(...foundObjects.map(obj => obj.y + (obj.height || 0) / 2));
                  
                  const padding = 10;
                  const groupWidth = (maxX - minX) + padding * 2;
                  const groupHeight = (maxY - minY) + padding * 2;
                  const groupCenterX = (minX + maxX) / 2;
                  const groupCenterY = (minY + maxY) / 2;
                  
                  await addObject({
                    type: 'group',
                    x: groupCenterX,
                    y: groupCenterY,
                    width: groupWidth,
                    height: groupHeight,
                    fill: 'transparent',
                    groupedObjects: objectIds,
                    nickname: 'Cloud',
                    zIndex: Math.max(...foundObjects.map(obj => obj.zIndex || 0)) + 1,
                    shadow: false,
                    createdBy: currentUser.uid
                  });
                }
              } catch (error) {
                console.error('Error grouping cloud:', error);
              }
            } else if (shapeName.includes('castle')) {
              // Create a castle using rectangles
              const castleColor = shapeColor || '#A0826D';
              const castleNicknames: string[] = [];
              
              // Main castle body (wide rectangle)
              await addObject({
                type: 'rectangle',
                x: shapeX,
                y: shapeY,
                width: 200 * shapeScale,
                height: 150 * shapeScale,
                fill: castleColor,
                cornerRadius: 0,
                nickname: 'Castle Main Body',
                zIndex: objects.length,
                shadow: true,
                createdBy: currentUser.uid
              });
              castleNicknames.push('Castle Main Body');
              
              // Left tower
              await addObject({
                type: 'rectangle',
                x: shapeX - 110 * shapeScale,
                y: shapeY - 30 * shapeScale,
                width: 60 * shapeScale,
                height: 180 * shapeScale,
                fill: castleColor,
                cornerRadius: 0,
                nickname: 'Castle Left Tower',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              castleNicknames.push('Castle Left Tower');
              
              // Right tower
              await addObject({
                type: 'rectangle',
                x: shapeX + 110 * shapeScale,
                y: shapeY - 30 * shapeScale,
                width: 60 * shapeScale,
                height: 180 * shapeScale,
                fill: castleColor,
                cornerRadius: 0,
                nickname: 'Castle Right Tower',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              castleNicknames.push('Castle Right Tower');
              
              // Center tower (tallest)
              await addObject({
                type: 'rectangle',
                x: shapeX,
                y: shapeY - 70 * shapeScale,
                width: 70 * shapeScale,
                height: 220 * shapeScale,
                fill: castleColor,
                cornerRadius: 0,
                nickname: 'Castle Center Tower',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              castleNicknames.push('Castle Center Tower');
              
              // Door
              await addObject({
                type: 'rectangle',
                x: shapeX,
                y: shapeY + 50 * shapeScale,
                width: 40 * shapeScale,
                height: 60 * shapeScale,
                fill: '#4A3728',
                cornerRadius: 5,
                nickname: 'Castle Door',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });
              castleNicknames.push('Castle Door');
              
              // Windows on towers
              const windowPositions = [
                { x: shapeX - 110 * shapeScale, y: shapeY - 50 * shapeScale, name: 'Left Tower Window' },
                { x: shapeX + 110 * shapeScale, y: shapeY - 50 * shapeScale, name: 'Right Tower Window' },
                { x: shapeX, y: shapeY - 100 * shapeScale, name: 'Center Tower Window' }
              ];
              
              for (const win of windowPositions) {
                await addObject({
                  type: 'rectangle',
                  x: win.x,
                  y: win.y,
                  width: 20 * shapeScale,
                  height: 25 * shapeScale,
                  fill: '#87CEEB',
                  cornerRadius: 3,
                  nickname: win.name,
                  zIndex: objects.length + 1,
                  shadow: false,
                  createdBy: currentUser.uid
                });
                castleNicknames.push(win.name);
              }
              
              // Auto-group the castle
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              try {
                const objectsRef = collection(db, 'canvases', CANVAS_ID, 'objects');
                const snapshot = await getDocs(objectsRef);
                const allObjects: CanvasObject[] = [];
                
                snapshot.forEach((doc) => {
                  const data = doc.data();
                  allObjects.push({ id: doc.id, ...data } as CanvasObject);
                });
                
                const foundObjects = allObjects.filter(obj => castleNicknames.includes(obj.nickname || ''));
                
                if (foundObjects.length >= 2) {
                  const objectIds = foundObjects.map(o => o.id);
                  const minX = Math.min(...foundObjects.map(obj => obj.x - (obj.width || 0) / 2));
                  const maxX = Math.max(...foundObjects.map(obj => obj.x + (obj.width || 0) / 2));
                  const minY = Math.min(...foundObjects.map(obj => obj.y - (obj.height || 0) / 2));
                  const maxY = Math.max(...foundObjects.map(obj => obj.y + (obj.height || 0) / 2));
                  
                  const padding = 10;
                  const groupWidth = (maxX - minX) + padding * 2;
                  const groupHeight = (maxY - minY) + padding * 2;
                  const groupCenterX = (minX + maxX) / 2;
                  const groupCenterY = (minY + maxY) / 2;
                  
                  await addObject({
                    type: 'group',
                    x: groupCenterX,
                    y: groupCenterY,
                    width: groupWidth,
                    height: groupHeight,
                    fill: 'transparent',
                    groupedObjects: objectIds,
                    nickname: 'Castle',
                    zIndex: Math.max(...foundObjects.map(obj => obj.zIndex || 0)) + 1,
                    shadow: false,
                    createdBy: currentUser.uid
                  });
                }
              } catch (error) {
                console.error('Error grouping castle:', error);
              }
            } else if (shapeName.includes('sun')) {
              // Create a sun using a circle and small rectangles for rays
              await addObject({
                type: 'circle',
                x: shapeX,
                y: shapeY,
                width: 80 * shapeScale,
                height: 80 * shapeScale,
                fill: action.data.color || '#FFD700',
                nickname: 'Sun Center',
                zIndex: objects.length,
                shadow: true,
                createdBy: currentUser.uid
              });
              
              // Add 8 rays around the sun
              const rayCount = 8;
              const rayDistance = 60 * shapeScale;
              for (let i = 0; i < rayCount; i++) {
                const angle = (i * 2 * Math.PI) / rayCount;
                const rayX = shapeX + Math.cos(angle) * rayDistance;
                const rayY = shapeY + Math.sin(angle) * rayDistance;
                
                await addObject({
                  type: 'rectangle',
                  x: rayX,
                  y: rayY,
                  width: 30 * shapeScale,
                  height: 10 * shapeScale,
                  fill: action.data.color || '#FFD700',
                  rotation: (angle * 180 / Math.PI),
                  nickname: `Sun Ray ${i + 1}`,
                  zIndex: objects.length,
                  shadow: false,
                  createdBy: currentUser.uid
                });
              }
            } else if (shapeName.includes('fish')) {
              // Create a simple fish like the example image
              const fishColor = action.data.color || '#000000';
              const fishNicknames: string[] = [];
              
              // Body (ellipse or circle)
              await addObject({
                type: 'ellipse',
                x: shapeX,
                y: shapeY,
                width: 100 * shapeScale,
                height: 70 * shapeScale,
                radiusX: 50 * shapeScale,
                radiusY: 35 * shapeScale,
                fill: fishColor,
                nickname: 'Fish Body',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              fishNicknames.push('Fish Body');
              
              // Tail (triangle using polygon)
              const tailVertices = [
                { x: -60 * shapeScale, y: -30 * shapeScale },
                { x: -90 * shapeScale, y: 0 },
                { x: -60 * shapeScale, y: 30 * shapeScale }
              ];
              
              await addObject({
                type: 'polygon',
                x: shapeX,
                y: shapeY,
                width: 30 * shapeScale,
                height: 60 * shapeScale,
                fill: fishColor,
                sides: 3,
                sideLength: 40,
                customVertices: tailVertices,
                nickname: 'Fish Tail',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              fishNicknames.push('Fish Tail');
              
              // Top fin (triangle)
              const topFinVertices = [
                { x: -10 * shapeScale, y: -35 * shapeScale },
                { x: 10 * shapeScale, y: -35 * shapeScale },
                { x: 0, y: -60 * shapeScale }
              ];
              
              await addObject({
                type: 'polygon',
                x: shapeX,
                y: shapeY,
                width: 20 * shapeScale,
                height: 25 * shapeScale,
                fill: fishColor,
                sides: 3,
                sideLength: 20,
                customVertices: topFinVertices,
                nickname: 'Fish Top Fin',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              fishNicknames.push('Fish Top Fin');
              
              // Bottom fin (triangle)
              const bottomFinVertices = [
                { x: -10 * shapeScale, y: 35 * shapeScale },
                { x: 10 * shapeScale, y: 35 * shapeScale },
                { x: 0, y: 60 * shapeScale }
              ];
              
              await addObject({
                type: 'polygon',
                x: shapeX,
                y: shapeY,
                width: 20 * shapeScale,
                height: 25 * shapeScale,
                fill: fishColor,
                sides: 3,
                sideLength: 20,
                customVertices: bottomFinVertices,
                nickname: 'Fish Bottom Fin',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
              fishNicknames.push('Fish Bottom Fin');
              
              // Eye (small circle)
              await addObject({
                type: 'circle',
                x: shapeX + 25 * shapeScale,
                y: shapeY - 10 * shapeScale,
                width: 10 * shapeScale,
                height: 10 * shapeScale,
                fill: '#000000',
                nickname: 'Fish Eye',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });
              fishNicknames.push('Fish Eye');
              
              // Auto-group the fish
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              try {
                const objectsRef = collection(db, 'canvases', CANVAS_ID, 'objects');
                const snapshot = await getDocs(objectsRef);
                const allObjects: CanvasObject[] = [];
                
                snapshot.forEach((doc) => {
                  const data = doc.data();
                  allObjects.push({ id: doc.id, ...data } as CanvasObject);
                });
                
                const foundObjects = allObjects.filter(obj => fishNicknames.includes(obj.nickname || ''));
                
                if (foundObjects.length >= 2) {
                  const objectIds = foundObjects.map(o => o.id);
                  const minX = Math.min(...foundObjects.map(obj => obj.x - (obj.width || 0) / 2));
                  const maxX = Math.max(...foundObjects.map(obj => obj.x + (obj.width || 0) / 2));
                  const minY = Math.min(...foundObjects.map(obj => obj.y - (obj.height || 0) / 2));
                  const maxY = Math.max(...foundObjects.map(obj => obj.y + (obj.height || 0) / 2));
                  
                  const padding = 10;
                  const groupWidth = (maxX - minX) + padding * 2;
                  const groupHeight = (maxY - minY) + padding * 2;
                  const groupCenterX = (minX + maxX) / 2;
                  const groupCenterY = (minY + maxY) / 2;
                  
                  await addObject({
                    type: 'group',
                    x: groupCenterX,
                    y: groupCenterY,
                    width: groupWidth,
                    height: groupHeight,
                    fill: 'transparent',
                    groupedObjects: objectIds,
                    nickname: 'Fish',
                    zIndex: Math.max(...foundObjects.map(obj => obj.zIndex || 0)) + 1,
                    shadow: false,
                    createdBy: currentUser.uid
                  });
                }
              } catch (error) {
                console.error('Error grouping fish:', error);
              }
            } else if (shapeName.includes('smiley') || shapeName.includes('smile') || shapeName.includes('happy face')) {
              // Create a smiley face using circle and curved lines
              const faceColor = action.data.color || '#FFD700';
              const faceSize = 120 * shapeScale;
              const smileyNicknames: string[] = [];
              
              // Face (yellow circle)
              await addObject({
                type: 'circle',
                x: shapeX,
                y: shapeY,
                width: faceSize,
                height: faceSize,
                fill: faceColor,
                nickname: 'Smiley Face',
                zIndex: objects.length,
                shadow: true,
                createdBy: currentUser.uid
              });
              smileyNicknames.push('Smiley Face');
              
              // Left eye (small black circle)
              await addObject({
                type: 'circle',
                x: shapeX - faceSize * 0.2,
                y: shapeY - faceSize * 0.15,
                width: faceSize * 0.15,
                height: faceSize * 0.15,
                fill: '#000000',
                nickname: 'Smiley Left Eye',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });
              smileyNicknames.push('Smiley Left Eye');
              
              // Right eye (small black circle)
              await addObject({
                type: 'circle',
                x: shapeX + faceSize * 0.2,
                y: shapeY - faceSize * 0.15,
                width: faceSize * 0.15,
                height: faceSize * 0.15,
                fill: '#000000',
                nickname: 'Smiley Right Eye',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });
              smileyNicknames.push('Smiley Right Eye');
              
              // Smile (curved line)
              const smileY = shapeY + faceSize * 0.1;
              const smileWidth = faceSize * 0.5;
              const smileLeft = shapeX - smileWidth / 2;
              const smileRight = shapeX + smileWidth / 2;
              const smileLength = Math.sqrt(Math.pow(smileWidth, 2));
              
              await addObject({
                type: 'line',
                x: smileLeft,
                y: smileY,
                x2: smileRight,
                y2: smileY,
                width: smileLength,
                height: 0,
                controlX: shapeX,
                controlY: smileY + faceSize * 0.2, // Curve down for smile
                curved: true,
                fill: '#000000',
                strokeWidth: Math.round(4 * shapeScale),
                nickname: 'Smiley Mouth',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });
              smileyNicknames.push('Smiley Mouth');
              
              // Auto-group the smiley
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              try {
                const objectsRef = collection(db, 'canvases', CANVAS_ID, 'objects');
                const snapshot = await getDocs(objectsRef);
                const allObjects: CanvasObject[] = [];
                
                snapshot.forEach((doc) => {
                  const data = doc.data();
                  allObjects.push({ id: doc.id, ...data } as CanvasObject);
                });
                
                const foundObjects = allObjects.filter(obj => smileyNicknames.includes(obj.nickname || ''));
                
                if (foundObjects.length >= 2) {
                  const objectIds = foundObjects.map(o => o.id);
                  const minX = Math.min(...foundObjects.map(obj => obj.x - (obj.width || 0) / 2));
                  const maxX = Math.max(...foundObjects.map(obj => obj.x + (obj.width || 0) / 2));
                  const minY = Math.min(...foundObjects.map(obj => obj.y - (obj.height || 0) / 2));
                  const maxY = Math.max(...foundObjects.map(obj => obj.y + (obj.height || 0) / 2));
                  
                  const padding = 10;
                  const groupWidth = (maxX - minX) + padding * 2;
                  const groupHeight = (maxY - minY) + padding * 2;
                  const groupCenterX = (minX + maxX) / 2;
                  const groupCenterY = (minY + maxY) / 2;
                  
                  await addObject({
                    type: 'group',
                    x: groupCenterX,
                    y: groupCenterY,
                    width: groupWidth,
                    height: groupHeight,
                    fill: 'transparent',
                    groupedObjects: objectIds,
                    nickname: 'Smiley Face',
                    zIndex: Math.max(...foundObjects.map(obj => obj.zIndex || 0)) + 1,
                    shadow: false,
                    createdBy: currentUser.uid
                  });
                }
              } catch (error) {
                console.error('Error grouping smiley:', error);
              }
            } else {
              // Default: create a simple representation
              await addObject({
                type: 'circle',
                x: shapeX,
                y: shapeY,
                width: 100 * shapeScale,
                height: 100 * shapeScale,
                fill: shapeColor,
                nickname: shapeName,
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });
            }
            break;

          case 'createComplex':
            // Create complex UI elements and auto-group them
            const complexType = action.data.type;
            const complexX = action.data.x || 0;
            const complexY = action.data.y || 0;
            const createdNicknames: string[] = []; // Track nicknames for grouping

            if (complexType === 'login-form') {
              // Create a login form with username, password, submit button, and forgot password
              // Title
              await addObject({
                type: 'text',
                x: complexX,
                y: complexY - 150,
                width: 200,
                height: 40,
                fill: '#1f2937',
                text: 'Login',
                fontSize: 32,
                fontFamily: 'Arial',
                fontStyle: 'bold',
                textAlign: 'center',
                nickname: 'Login Title',
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Username field background
              await addObject({
                type: 'rectangle',
                x: complexX,
                y: complexY - 70,
                width: 300,
                height: 50,
                fill: '#f3f4f6',
                nickname: 'Username Field',
                cornerRadius: 8,
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Username label
              await addObject({
                type: 'text',
                x: complexX - 100,
                y: complexY - 70,
                width: 100,
                height: 30,
                fill: '#6b7280',
                text: 'Username',
                fontSize: 14,
                fontFamily: 'Arial',
                fontStyle: 'normal',
                textAlign: 'left',
                nickname: 'Username Label',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Password field background
              await addObject({
                type: 'rectangle',
                x: complexX,
                y: complexY,
                width: 300,
                height: 50,
                fill: '#f3f4f6',
                nickname: 'Password Field',
                cornerRadius: 8,
                zIndex: objects.length,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Password label
              await addObject({
                type: 'text',
                x: complexX - 100,
                y: complexY,
                width: 100,
                height: 30,
                fill: '#6b7280',
                text: 'Password',
                fontSize: 14,
                fontFamily: 'Arial',
                fontStyle: 'normal',
                textAlign: 'left',
                nickname: 'Password Label',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Forgot Password link (between password and submit button)
              await addObject({
                type: 'text',
                x: complexX + 70,
                y: complexY + 35,
                width: 140,
                height: 20,
                fill: '#3b82f6',
                text: 'Forgot Password?',
                fontSize: 12,
                fontFamily: 'Arial',
                fontStyle: 'normal',
                textAlign: 'right',
                nickname: 'Forgot Password',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Submit button
              await addObject({
                type: 'rectangle',
                x: complexX,
                y: complexY + 80,
                width: 300,
                height: 50,
                fill: '#3b82f6',
                nickname: 'Login Button',
                cornerRadius: 8,
                zIndex: objects.length,
                shadow: true,
                createdBy: currentUser.uid
              });

              // Submit button text
              await addObject({
                type: 'text',
                x: complexX,
                y: complexY + 80,
                width: 200,
                height: 30,
                fill: '#ffffff',
                text: 'Login',
                fontSize: 18,
                fontFamily: 'Arial',
                fontStyle: 'bold',
                textAlign: 'center',
                nickname: 'Login Button Text',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });
              
              // Track nicknames for grouping
              createdNicknames.push('Login Title', 'Username Field', 'Username Label', 
                                    'Password Field', 'Password Label', 'Forgot Password',
                                    'Login Button', 'Login Button Text');
            } else if (complexType === 'nav-bar') {
              // Create a navigation bar
              const itemCount = action.data.options?.itemCount || 4;
              const navWidth = 800;
              const itemWidth = navWidth / itemCount;

              // Nav bar background
              await addObject({
                type: 'rectangle',
                x: complexX,
                y: complexY,
                width: navWidth,
                height: 60,
                fill: '#1f2937',
                nickname: 'Nav Bar',
                cornerRadius: 0,
                zIndex: objects.length,
                shadow: true,
                createdBy: currentUser.uid
              });

              // Nav items
              const navItems = ['Home', 'About', 'Services', 'Contact'];
              createdNicknames.push('Nav Bar'); // Add background
              
              for (let i = 0; i < itemCount; i++) {
                await addObject({
                  type: 'text',
                  x: complexX - navWidth / 2 + itemWidth / 2 + (i * itemWidth),
                  y: complexY,
                  width: itemWidth - 20,
                  height: 30,
                  fill: '#ffffff',
                  text: navItems[i] || `Item ${i + 1}`,
                  fontSize: 16,
                  fontFamily: 'Arial',
                  fontStyle: 'normal',
                  textAlign: 'center',
                  nickname: `Nav Item ${i + 1}`,
                  zIndex: objects.length + 1,
                  shadow: false,
                  createdBy: currentUser.uid
                });
                createdNicknames.push(`Nav Item ${i + 1}`);
              }
            } else if (complexType === 'card') {
              // Create a card layout
              // Card background
              await addObject({
                type: 'rectangle',
                x: complexX,
                y: complexY,
                width: 300,
                height: 400,
                fill: '#ffffff',
                nickname: 'Card',
                cornerRadius: 12,
                zIndex: objects.length,
                shadow: true,
                createdBy: currentUser.uid
              });

              // Card image placeholder
              await addObject({
                type: 'rectangle',
                x: complexX,
                y: complexY - 100,
                width: 280,
                height: 160,
                fill: '#e5e7eb',
                nickname: 'Card Image',
                cornerRadius: 8,
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Card title
              await addObject({
                type: 'text',
                x: complexX,
                y: complexY + 40,
                width: 260,
                height: 40,
                fill: '#1f2937',
                text: action.data.options?.title || 'Card Title',
                fontSize: 24,
                fontFamily: 'Arial',
                fontStyle: 'bold',
                textAlign: 'center',
                nickname: 'Card Title',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });

              // Card description
              await addObject({
                type: 'text',
                x: complexX,
                y: complexY + 100,
                width: 260,
                height: 60,
                fill: '#6b7280',
                text: 'This is a card description with some content.',
                fontSize: 14,
                fontFamily: 'Arial',
                fontStyle: 'normal',
                textAlign: 'center',
                nickname: 'Card Description',
                zIndex: objects.length + 1,
                shadow: false,
                createdBy: currentUser.uid
              });
              
              // Track nicknames for grouping
              createdNicknames.push('Card', 'Card Image', 'Card Title', 'Card Description');
            }
            
            // Auto-group complex UI elements
            if (createdNicknames.length > 0 && action.data.autoGroup !== false) {
              // Wait for all objects to be created in Firestore
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              const groupName = complexType === 'login-form' ? 'Login Form'
                : complexType === 'nav-bar' ? 'Navigation Bar'
                : complexType === 'card' ? 'Card'
                : 'Complex UI';
              
              console.log('Auto-grouping complex UI. Looking for nicknames:', createdNicknames);
              
              // Query Firestore directly for fresh data
              try {
                const objectsRef = collection(db, 'canvases', CANVAS_ID, 'objects');
                const snapshot = await getDocs(objectsRef);
                const allObjects: CanvasObject[] = [];
                
                snapshot.forEach((doc) => {
                  const data = doc.data();
                  allObjects.push({ id: doc.id, ...data } as CanvasObject);
                });
                
                // Find objects by nicknames
                const foundObjects = allObjects.filter(obj => 
                  createdNicknames.includes(obj.nickname || '')
                );
                
                console.log('Found', foundObjects.length, 'objects out of', createdNicknames.length, 'expected');
                
                if (foundObjects.length >= 2) {
                  const objectIds = foundObjects.map(o => o.id);
                  const minX = Math.min(...foundObjects.map(obj => obj.x - (obj.width || 0) / 2));
                  const maxX = Math.max(...foundObjects.map(obj => obj.x + (obj.width || 0) / 2));
                  const minY = Math.min(...foundObjects.map(obj => obj.y - (obj.height || 0) / 2));
                  const maxY = Math.max(...foundObjects.map(obj => obj.y + (obj.height || 0) / 2));
                  
                  const padding = 20;
                  const groupWidth = (maxX - minX) + padding * 2;
                  const groupHeight = (maxY - minY) + padding * 2;
                  const groupCenterX = (minX + maxX) / 2;
                  const groupCenterY = (minY + maxY) / 2;
                  
                  await addObject({
                    type: 'group',
                    x: groupCenterX,
                    y: groupCenterY,
                    width: groupWidth,
                    height: groupHeight,
                    fill: 'transparent',
                    groupedObjects: objectIds,
                    nickname: groupName,
                    zIndex: Math.max(...foundObjects.map(obj => obj.zIndex || 0)) + 1,
                    shadow: false,
                    createdBy: currentUser.uid
                  });
                  
                  console.log('✅ Created group:', groupName, 'with', foundObjects.length, 'objects');
                } else {
                  console.log('⚠️ Not enough objects found for grouping. Expected:', createdNicknames.length, 'Found:', foundObjects.length);
                  console.log('Available objects:', allObjects.map(o => o.nickname));
                }
              } catch (error) {
                console.error('Error querying Firestore for grouping:', error);
              }
            }
            break;

          case 'createGroup':
            // Find all objects matching the identifiers
            const objectsToGroup: string[] = [];
            
            for (const identifier of action.data.objectIdentifiers) {
              const obj = objects.find(o => {
                const id = identifier.toLowerCase();
                const objNickname = o.nickname?.toLowerCase();
                const objType = o.type?.toLowerCase();
                const objText = o.text?.toLowerCase();
                
                // Match by nickname (best for specific objects)
                if (objNickname && id.includes(objNickname)) return true;
                // Match by text
                if (objText && id.includes(objText)) return true;
                // Match by type
                if (objType && id.includes(objType)) return true;
                
                return false;
              });
              
              if (obj) {
                objectsToGroup.push(obj.id);
              }
            }
            
            console.log('Grouping objects:', objectsToGroup);
            
            if (objectsToGroup.length >= 2) {
              // Select the objects and create group
              selectMultiple(objectsToGroup);
              
              // Wait a bit for selection to register
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Create the group using the context method
              const selectedObjects = objects.filter(obj => objectsToGroup.includes(obj.id));
              
              if (selectedObjects.length >= 2) {
                // Calculate bounds of all objects
                const minX = Math.min(...selectedObjects.map(obj => obj.x - (obj.width || 0) / 2));
                const maxX = Math.max(...selectedObjects.map(obj => obj.x + (obj.width || 0) / 2));
                const minY = Math.min(...selectedObjects.map(obj => obj.y - (obj.height || 0) / 2));
                const maxY = Math.max(...selectedObjects.map(obj => obj.y + (obj.height || 0) / 2));
                
                const padding = 20;
                const groupWidth = (maxX - minX) + padding * 2;
                const groupHeight = (maxY - minY) + padding * 2;
                const groupCenterX = (minX + maxX) / 2;
                const groupCenterY = (minY + maxY) / 2;
                
                await addObject({
                  type: 'group',
                  x: groupCenterX,
                  y: groupCenterY,
                  width: groupWidth,
                  height: groupHeight,
                  fill: 'transparent',
                  groupedObjects: objectsToGroup,
                  nickname: action.data.groupName || 'Group',
                  zIndex: Math.max(...selectedObjects.map(obj => obj.zIndex || 0)) + 1,
                  shadow: false,
                  createdBy: currentUser.uid
                });
              }
            } else {
              console.log('Not enough objects found to group. Found:', objectsToGroup.length);
            }
            break;

          case 'deleteShape':
            const deleteObj = objects.find(obj => {
              const identifier = action.data.identifier.toLowerCase();
              const objNickname = obj.nickname?.toLowerCase();
              const objType = obj.type?.toLowerCase();
              
              // Match by nickname
              if (objNickname && identifier.includes(objNickname)) return true;
              // Match by type
              if (objType && identifier.includes(objType)) return true;
              
              return false;
            });
            if (deleteObj) {
              await deleteObject(deleteObj.id);
            }
            break;

          case 'getCanvasState':
            // This just returns info, no action needed
            break;
        }
      } catch (error) {
        console.error('Error executing action:', error);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !currentUser) {
      console.log('Cannot send message:', { hasInput: !!inputValue.trim(), hasUser: !!currentUser });
      return;
    }

    const messageText = inputValue.trim();
    console.log('Sending message:', messageText, 'AI Mode:', isAIMode);
    setInputValue('');

    if (isAIMode) {
      // AI Mode: Send to AI and execute commands
      setIsLoading(true);
      setProgress(0);
      setLoadingStatus(uploadedImage ? 'Analyzing image...' : 'Processing your request...');
      
      try {
        // Send user message to chat
        console.log('Sending AI query to chat...');
        await sendMessage(`🤖 AI: ${messageText}`, false);
        
        setLoadingStatus(uploadedImage ? 'AI is analyzing the image...' : 'AI is planning the actions...');
        
        // Use image-based processing if image is uploaded
        const aiResponse = uploadedImage 
          ? await processAICommandWithImage(messageText, uploadedImage, objects)
          : await processAICommand(messageText, objects);
        console.log('AI Response:', aiResponse);
        
        // Clear uploaded image after processing
        if (uploadedImage) {
          setUploadedImage(null);
        }
        
        if (aiResponse.success && aiResponse.actions.length > 0) {
          console.log('AI wants to execute', aiResponse.actions.length, 'actions:', aiResponse.actions);
          
          // Show preview if creating/modifying multiple objects (3+)
          if (aiResponse.actions.length >= 3) {
            setPendingActions(aiResponse);
            await sendMessage(`🔍 AI: I want to create ${aiResponse.actions.length} objects. Please review and confirm.`, true);
          } else {
            // Execute immediately for simple commands (1-2 actions)
            console.log('Executing', aiResponse.actions.length, 'actions immediately');
            await executeAIActions(aiResponse);
            
            // Send success message
            await sendMessage(`✅ AI: ${aiResponse.message}`, true);
            
            // Set active suggestions for clickable buttons
            if (aiResponse.suggestions && aiResponse.suggestions.length > 0) {
              setActiveSuggestions(aiResponse.suggestions);
            }
          }
        } else {
          // Send AI response (no actions)
          await sendMessage(`🤖 AI: ${aiResponse.message}`, true);
        }
      } catch (error) {
        console.error('AI Error:', error);
        await sendMessage('❌ AI: Sorry, I encountered an error processing that request.', true);
      } finally {
        setIsLoading(false);
        setProgress(0);
        setLoadingStatus('');
      }
    } else {
      // Normal chat mode
      try {
        console.log('Sending regular message to Firestore...');
        await sendMessage(messageText, false);
        console.log('Message sent successfully!');
      } catch (error) {
        console.error('Error sending message:', error);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          border: 'none',
          color: 'white',
          fontSize: '28px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          zIndex: 999
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        }}
        title="Open Chat"
      >
        💬
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '380px',
        height: '500px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: 999,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '16px 20px',
          color: 'white',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            {isAIMode ? '🤖 AI Assistant' : '💬 Team Chat'}
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
            {isAIMode ? 'AI is ready to help' : `${messages.length} messages`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Clear Chat Button */}
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: 'none',
                color: 'white',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              title="Clear all messages"
            >
              🗑️
            </button>
          )}
          
          {/* Close Button */}
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              fontSize: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: '#f9fafb',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          position: 'relative'
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '20px' }}>
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 20px' }}>
            <p style={{ margin: 0, fontSize: '24px', marginBottom: '8px' }}>💬</p>
            <p style={{ margin: 0, fontSize: '14px' }}>No messages yet</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
              Start a conversation!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isCurrentUser = msg.userId === currentUser?.uid;
            const isAI = msg.isAI;
            
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isCurrentUser ? 'flex-end' : 'flex-start'
                }}
              >
                {/* User name and time */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                    fontSize: '12px',
                    color: '#6b7280'
                  }}
                >
                  {!isCurrentUser && (
                    <>
                      <div
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isAI ? '#8b5cf6' : msg.userColor
                        }}
                      />
                      <span style={{ fontWeight: '500' }}>{msg.userName}</span>
                      <span>•</span>
                    </>
                  )}
                  <span>{formatTimestamp(msg.timestamp)}</span>
                </div>
                
                {/* Message bubble */}
                <div
                  style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: isCurrentUser 
                      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                      : isAI
                      ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                      : 'white',
                    color: isCurrentUser || isAI ? 'white' : '#1f2937',
                    fontSize: '14px',
                    lineHeight: '1.5',
                    wordWrap: 'break-word',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        
        {isLoading && (
          <div
            style={{
              padding: '12px',
              background: '#f3f4f6',
              borderRadius: '8px',
              margin: '8px 0'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px'
              }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid #e5e7eb',
                  borderTopColor: '#8b5cf6',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }}
              />
              <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: '500' }}>
                {loadingStatus || 'AI is thinking...'}
              </span>
            </div>
            
            {/* Progress bar */}
            {progress > 0 && (
              <div
                style={{
                  width: '100%',
                  height: '6px',
                  background: '#e5e7eb',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                    transition: 'width 0.3s ease',
                    borderRadius: '3px'
                  }}
                />
              </div>
            )}
            
            {progress > 0 && (
              <div style={{ 
                fontSize: '11px', 
                color: '#9ca3af', 
                textAlign: 'center',
                marginTop: '4px'
              }}>
                {progress}% complete
              </div>
            )}
          </div>
        )}
        
        {/* Scroll to Bottom Button */}
        {showScrollButton && (
          <button
            onClick={scrollToBottom}
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
              transition: 'all 0.2s ease',
              zIndex: 10
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
            }}
            title="Scroll to bottom"
          >
            ↓
          </button>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Preview Panel (shows when pending actions) */}
      {pendingActions && (
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid #e5e7eb',
            background: '#fef3c7',
            borderLeft: '4px solid #f59e0b'
          }}
        >
          <div style={{ marginBottom: '12px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', color: '#92400e' }}>
              🔍 Preview: AI will create {pendingActions.actions.length} objects
            </h4>
            <div style={{ 
              maxHeight: '150px', 
              overflowY: 'auto',
              fontSize: '12px',
              color: '#78350f',
              background: 'white',
              padding: '8px',
              borderRadius: '6px'
            }}>
              {pendingActions.actions.map((action, idx) => (
                <div key={idx} style={{ marginBottom: '4px' }}>
                  • {action.type === 'createShape' 
                      ? `${action.data.type} (${action.data.color})`
                      : action.type === 'createText'
                      ? `Text: "${action.data.text}"`
                      : action.type === 'createComplex'
                      ? `Complex: ${action.data.type}`
                      : action.type}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={async () => {
                setIsLoading(true);
                setProgress(0);
                setLoadingStatus('Starting creation...');
                try {
                  await executeAIActions(pendingActions);
                  await sendMessage(`✅ AI: Created ${pendingActions.actions.length} objects successfully!`, true);
                  
                  // Set active suggestions for clickable buttons
                  if (pendingActions.suggestions && pendingActions.suggestions.length > 0) {
                    setActiveSuggestions(pendingActions.suggestions);
                  }
                  
                  setPendingActions(null);
                } catch (error) {
                  console.error('Error executing actions:', error);
                  await sendMessage('❌ AI: Error creating objects', true);
                } finally {
                  setIsLoading(false);
                  setProgress(0);
                  setLoadingStatus('');
                }
              }}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              ✓ Confirm & Create
            </button>
            <button
              onClick={() => {
                setPendingActions(null);
                sendMessage('🚫 AI: Creation cancelled', true);
              }}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '10px',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              × Cancel
            </button>
          </div>
        </div>
      )}

      {/* AI Suggestions (clickable) */}
      {isAIMode && showSuggestions && activeSuggestions.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid #e5e7eb',
            background: '#f0fdf4',
            borderLeft: '4px solid #10b981'
          }}
        >
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#059669' }}>
              💡 Try these next:
            </span>
            <button
              onClick={() => setActiveSuggestions([])}
              style={{
                background: 'none',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: '18px',
                padding: '0',
                width: '20px',
                height: '20px'
              }}
              title="Dismiss suggestions"
            >
              ×
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activeSuggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setInputValue(suggestion);
                  setActiveSuggestions([]);
                  inputRef.current?.focus();
                }}
                style={{
                  padding: '8px 12px',
                  background: 'white',
                  border: '1px solid #d1fae5',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#065f46',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  fontWeight: '500'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#d1fae5';
                  e.currentTarget.style.borderColor = '#10b981';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#d1fae5';
                }}
              >
                {idx + 1}. {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* AI Mode Toggle */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #e5e7eb',
          background: 'white',
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          alignItems: 'center'
        }}
      >
        <button
          onClick={() => setIsAIMode(!isAIMode)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: isAIMode 
              ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
              : '#f3f4f6',
            color: isAIMode ? 'white' : '#6b7280',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            transition: 'all 0.2s ease',
            boxShadow: isAIMode ? '0 2px 8px rgba(139, 92, 246, 0.3)' : 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <span style={{ fontSize: '16px' }}>🤖</span>
          {isAIMode ? 'AI Mode Active' : 'Enable AI Mode'}
        </button>
        
        {/* AI Suggestions Toggle - Checkbox */}
        {isAIMode && (
          <input
            type="checkbox"
            checked={showSuggestions}
            onChange={() => setShowSuggestions(!showSuggestions)}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
              accentColor: '#10b981'
            }}
            title={showSuggestions ? 'Hide AI Suggestions' : 'Show AI Suggestions'}
          />
        )}
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '16px',
          borderTop: '1px solid #e5e7eb',
          background: 'white',
          borderBottomLeftRadius: '16px',
          borderBottomRightRadius: '16px'
        }}
      >
        {/* Image Preview */}
        {uploadedImage && (
          <div style={{
            marginBottom: '12px',
            position: 'relative',
            display: 'inline-block'
          }}>
            <img 
              src={uploadedImage} 
              alt="Uploaded" 
              style={{
                maxWidth: '200px',
                maxHeight: '150px',
                borderRadius: '8px',
                border: '2px solid #8b5cf6'
              }}
            />
            <button
              onClick={() => setUploadedImage(null)}
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-8px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}
        >
          {/* Image Upload Button (only in AI mode) */}
          {isAIMode && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                style={{
                  padding: '12px',
                  background: uploadedImage ? '#8b5cf6' : '#f3f4f6',
                  color: uploadedImage ? 'white' : '#6b7280',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                title="Upload image to recreate design"
              >
                🖼️
              </button>
            </>
          )}

          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAIMode ? (uploadedImage ? "Describe what to recreate..." : "Ask AI to create shapes...") : "Type a message..."}
            disabled={isLoading}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '12px',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s ease',
              background: isLoading ? '#f9fafb' : 'white'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#667eea';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#d1d5db';
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            style={{
              padding: '12px 20px',
              background: isAIMode
                ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
                : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: (!inputValue.trim() || isLoading) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              opacity: (!inputValue.trim() || isLoading) ? 0.5 : 1,
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              if (inputValue.trim() && !isLoading) {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
        
        {isAIMode && !uploadedImage && (
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: '11px',
              color: '#9ca3af',
              textAlign: 'center'
            }}
          >
            💡 Try: "Create a blue rectangle" or click 🖼️ to upload a design
          </p>
        )}
        
        {isAIMode && uploadedImage && (
          <p
            style={{
              margin: '8px 0 0 0',
              fontSize: '11px',
              color: '#8b5cf6',
              textAlign: 'center',
              fontWeight: '500'
            }}
          >
            🎨 Image uploaded! AI will analyze and recreate the design
          </p>
        )}
      </div>

      {/* CSS Animation for loading spinner */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default ChatWindow;

