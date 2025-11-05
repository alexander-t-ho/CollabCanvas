import React, { useRef, useEffect, useState } from 'react';
import { Rect, Circle, Image as KonvaImage, Transformer, Text } from 'react-konva';
import { CanvasObject as CanvasObjectType } from '../../types';
import { useCanvas } from '../../contexts/CanvasContext';
import InteractiveLine from './InteractiveLine';

interface Props {
  object: CanvasObjectType;
  isSelected: boolean;
  onDrag?: (position: { x: number; y: number }) => void;
  onDragEnd?: () => void;
}

const CanvasObject: React.FC<Props> = ({ object, isSelected, onDrag, onDragEnd }) => {
  const { updateObject, updateObjectLive, selectObject, selectedIds, addToSelection, removeFromSelection, objects } = useCanvas();
  const shapeRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (isSelected && transformerRef.current && shapeRef.current) {
      transformerRef.current.nodes([shapeRef.current]);
      transformerRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  // Handle click with multi-selection support (Shift key)
  const handleClick = (e: any) => {
    const isMultiSelect = e.evt?.shiftKey;
    
    if (isMultiSelect) {
      if (selectedIds.includes(object.id)) {
        removeFromSelection(object.id);
      } else {
        addToSelection(object.id);
      }
    } else {
      selectObject(object.id);
    }
  };

  // Handle double-click for text - focus TextEditor panel, or select individual objects in groups
  const handleDoubleClick = (e: any) => {
    e.cancelBubble = true;
    
    if (object.type === 'text') {
      selectObject(object.id);
      window.dispatchEvent(new CustomEvent('focusTextEditor', { detail: { objectId: object.id } }));
    } else {
      // For objects in a group, double-click selects the individual object
      // Check if this object is part of any group
      const parentGroup = objects.find(obj => 
        obj.type === 'group' && obj.groupedObjects?.includes(object.id)
      );
      
      if (parentGroup) {
        // Select the individual object, not the group
        selectObject(object.id);
      }
    }
  };
  useEffect(() => {
    if (object.type === 'image' && object.src) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setImage(img);
      };
      img.src = object.src;
    }
  }, [object.type, object.src]);

  const handleDragMove = (e: any) => {
    if (onDrag && (object.type === 'rectangle' || object.type === 'circle' || object.type === 'image' || object.type === 'text')) {
      let newX = Math.round(e.target.x());
      let newY = Math.round(e.target.y());
      
      // Snap to alignment with other objects and axes
      const snapThreshold = 10;
      
      // First, check alignment with X and Y axes (origin)
      if (Math.abs(newX) < snapThreshold) {
        newX = 0; // Snap to Y-axis (X = 0)
      }
      
      if (Math.abs(newY) < snapThreshold) {
        newY = 0; // Snap to X-axis (Y = 0)
      }
      
      // Then check alignment with other objects
      objects.forEach(obj => {
        if (obj.id === object.id) return;
        
        // Check horizontal alignment (same X)
        if (Math.abs(obj.x - newX) < snapThreshold) {
          newX = obj.x; // Snap to this object's X
        }
        
        // Check vertical alignment (same Y)
        if (Math.abs(obj.y - newY) < snapThreshold) {
          newY = obj.y; // Snap to this object's Y
        }
      });
      
      // Update position on canvas (for visual feedback)
      e.target.x(newX);
      e.target.y(newY);
      
      onDrag({ x: newX, y: newY });
      
      // Update local state immediately for real-time feedback (no history)
      updateObjectLive(object.id, { x: newX, y: newY });
    }
  };

  const handleDragEnd = (e: any) => {
    const newX = Math.round(e.target.x());
    const newY = Math.round(e.target.y());
    
    if (object.type === 'line') {
      // For lines, we need to update both start and end points
      const deltaX = newX - object.x;
      const deltaY = newY - object.y;
      
      // Use updateObject which saves to history
      updateObject(object.id, {
        x: newX,
        y: newY,
        x2: Math.round((object.x2 || 0) + deltaX),
        y2: Math.round((object.y2 || 0) + deltaY),
      });
    } else if (object.type === 'group') {
      // For groups, move all grouped objects together
      const deltaX = newX - object.x;
      const deltaY = newY - object.y;
      
      updateObject(object.id, {
        x: newX,
        y: newY,
      });
      
      // Move all grouped objects
      if (object.groupedObjects) {
        object.groupedObjects.forEach(objId => {
          const groupedObj = objects.find((o: any) => o.id === objId);
          if (groupedObj) {
            updateObject(objId, {
              x: groupedObj.x + deltaX,
              y: groupedObj.y + deltaY,
            });
          }
        });
      }
    } else {
      // Check if this object belongs to a group
      const parentGroup = objects.find((obj: any) => 
        obj.type === 'group' && obj.groupedObjects?.includes(object.id)
      );
      
      if (parentGroup) {
        // Object is part of a group - move all objects in the group
        const deltaX = newX - object.x;
        const deltaY = newY - object.y;
        
        // Update this object
        updateObject(object.id, {
          x: newX,
          y: newY,
        });
        
        // Update the group position
        updateObject(parentGroup.id, {
          x: parentGroup.x + deltaX,
          y: parentGroup.y + deltaY,
        });
        
        // Move all other objects in the group
        if (parentGroup.groupedObjects) {
          parentGroup.groupedObjects.forEach(objId => {
            if (objId !== object.id) {
              const groupedObj = objects.find((o: any) => o.id === objId);
              if (groupedObj) {
                updateObject(objId, {
                  x: groupedObj.x + deltaX,
                  y: groupedObj.y + deltaY,
                });
              }
            }
          });
        }
      } else {
        // Not in a group - normal update
        updateObject(object.id, {
          x: newX,
          y: newY,
        });
      }
    }

    // Clear alignment guides
    if (onDragEnd) {
      onDragEnd();
    }
    
    // History is automatically saved by updateObject command
  };

  const handleTransform = (e: any) => {
    const node = shapeRef.current;
    // Apply real-time snapping while rotating with shift key
    if (e.evt?.shiftKey) {
      const rotation = node.rotation();
      const snappedRotation = Math.round(rotation / 45) * 45;
      node.rotation(snappedRotation);
    }
  };

  const handleTransformEnd = (e: any) => {
    const node = shapeRef.current;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    let rotation = node.rotation();
    
    // Snap to 45-degree angles if shift key is pressed
    if (e.evt?.shiftKey) {
      rotation = Math.round(rotation / 45) * 45;
      node.rotation(rotation);
    }

    node.scaleX(1);
    node.scaleY(1);

    if (object.type === 'group') {
      // For groups, rotate all grouped objects together
      const rotationDelta = rotation - (object.rotation || 0);
      
      updateObject(object.id, {
        rotation: Math.round(rotation),
      });
      
      // Rotate all grouped objects around the group center
      if (object.groupedObjects && rotationDelta !== 0) {
        const groupCenterX = object.x;
        const groupCenterY = object.y;
        
        object.groupedObjects.forEach(objId => {
          const groupedObj = objects.find((o: any) => o.id === objId);
          if (groupedObj) {
            // Calculate new position after rotation
            const dx = groupedObj.x - groupCenterX;
            const dy = groupedObj.y - groupCenterY;
            const rad = (rotationDelta * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            
            const newX = groupCenterX + (dx * cos - dy * sin);
            const newY = groupCenterY + (dx * sin + dy * cos);
            
            updateObject(objId, {
              x: Math.round(newX),
              y: Math.round(newY),
              rotation: Math.round((groupedObj.rotation || 0) + rotationDelta),
            });
          }
        });
      }
    } else if (object.type === 'line') {
      // For lines, scaling affects the end points
      const newWidth = Math.round(Math.max(5, node.width() * scaleX));
      const newHeight = Math.round(Math.max(5, node.height() * scaleY));
      
      updateObject(object.id, {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: newWidth,
        height: newHeight,
        x2: Math.round(node.x() + newWidth),
        y2: Math.round(node.y() + newHeight),
        rotation: Math.round(rotation),
      });
    } else if (object.type === 'text') {
      // For text with offset, only change width not font size
      const newWidth = Math.round(Math.max(50, node.width() * scaleX));
      
      // Position is at center due to offset
      const centerX = Math.round(node.x());
      const centerY = Math.round(node.y());
      
      updateObject(object.id, {
        x: centerX,
        y: centerY,
        width: newWidth,
        // Font size stays the same - only text box width changes
        rotation: Math.round(rotation),
      });
    } else if (object.type === 'rectangle' || object.type === 'image') {
      // For rectangles and images with offset, we need to adjust position
      const newWidth = Math.round(Math.max(5, node.width() * scaleX));
      const newHeight = Math.round(Math.max(5, node.height() * scaleY));
      
      // When using offsetX/offsetY, Konva position is at the center
      // We need to convert back to top-left corner for storage
      const centerX = Math.round(node.x());
      const centerY = Math.round(node.y());
      const topLeftX = centerX; // Keep center as position for consistency
      const topLeftY = centerY;
      
      updateObject(object.id, {
        x: topLeftX,
        y: topLeftY,
        width: newWidth,
        height: newHeight,
        rotation: Math.round(rotation),
      });
    } else {
      // Check if this object belongs to a group
      const parentGroup = objects.find((obj: any) => 
        obj.type === 'group' && obj.groupedObjects?.includes(object.id)
      );
      
      if (parentGroup) {
        // Object is part of a group - rotate/scale all objects in the group
        const rotationDelta = rotation - (object.rotation || 0);
        const newWidth = Math.round(Math.max(5, node.width() * scaleX));
        const newHeight = Math.round(Math.max(5, node.height() * scaleY));
        
        // Update this object
        updateObject(object.id, {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          width: newWidth,
          height: newHeight,
          rotation: Math.round(rotation),
        });
        
        // Update the group rotation
        updateObject(parentGroup.id, {
          rotation: Math.round((parentGroup.rotation || 0) + rotationDelta),
        });
        
        // Rotate/scale all other objects in the group
        if (parentGroup.groupedObjects && rotationDelta !== 0) {
          const groupCenterX = parentGroup.x;
          const groupCenterY = parentGroup.y;
          
          parentGroup.groupedObjects.forEach(objId => {
            if (objId !== object.id) {
              const groupedObj = objects.find((o: any) => o.id === objId);
              if (groupedObj) {
                // Calculate new position after rotation
                const dx = groupedObj.x - groupCenterX;
                const dy = groupedObj.y - groupCenterY;
                const rad = (rotationDelta * Math.PI) / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                
                const newX = groupCenterX + (dx * cos - dy * sin);
                const newY = groupCenterY + (dx * sin + dy * cos);
                
                updateObject(objId, {
                  x: Math.round(newX),
                  y: Math.round(newY),
                  rotation: Math.round((groupedObj.rotation || 0) + rotationDelta),
                });
              }
            }
          });
        }
      } else {
        // Not in a group - normal update
        updateObject(object.id, {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
          width: Math.round(Math.max(5, node.width() * scaleX)),
          height: Math.round(Math.max(5, node.height() * scaleY)),
          rotation: Math.round(rotation),
        });
      }
    }
    
    // History is automatically saved by updateObject command
  };

  const renderShape = () => {
    switch (object.type) {
      case 'rectangle':
        return (
          <Rect
            id={`shape-${object.id}`}
            ref={shapeRef}
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            fill={object.fill}
            opacity={object.opacity ?? 1}
            cornerRadius={object.cornerRadius || 0}
            rotation={object.rotation || 0}
            offsetX={object.width / 2}
            offsetY={object.height / 2}
            shadowEnabled={object.shadow || false}
            shadowBlur={object.shadow ? 15 : 0}
            shadowOffset={object.shadow ? { x: 5, y: 5 } : { x: 0, y: 0 }}
            shadowOpacity={object.shadow ? 0.5 : 0}
            draggable
            onClick={handleClick}
            onDblClick={handleDoubleClick}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
          />
        );
      case 'circle':
        return (
          <Circle
            id={`shape-${object.id}`}
            ref={shapeRef}
            x={object.x}
            y={object.y}
            radius={object.width / 2}
            fill={object.fill}
            opacity={object.opacity ?? 1}
            rotation={object.rotation || 0}
            // Circles naturally rotate around center, no offset needed
            shadowEnabled={object.shadow || false}
            shadowBlur={object.shadow ? 15 : 0}
            shadowOffset={object.shadow ? { x: 5, y: 5 } : { x: 0, y: 0 }}
            shadowOpacity={object.shadow ? 0.5 : 0}
            draggable
            onClick={handleClick}
            onDblClick={handleDoubleClick}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
          />
        );
      case 'line':
        return (
          <InteractiveLine
            object={object}
            isSelected={isSelected}
          />
        );
      case 'image':
        return image ? (
          <KonvaImage
            id={`shape-${object.id}`}
            ref={shapeRef}
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            image={image}
            opacity={object.opacity ?? 1}
            rotation={object.rotation || 0}
            offsetX={object.width / 2} // Rotate around center
            offsetY={object.height / 2} // Rotate around center
            cornerRadius={object.cornerRadius || 0} // Add corner radius support
            shadowEnabled={object.shadow || false}
            shadowBlur={object.shadow ? 15 : 0}
            shadowOffset={object.shadow ? { x: 5, y: 5 } : { x: 0, y: 0 }}
            shadowOpacity={object.shadow ? 0.5 : 0}
            draggable
            onClick={handleClick}
            onDblClick={handleDoubleClick}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
          />
        ) : null;
      case 'text':
        return (
          <Text
            id={`shape-${object.id}`}
            ref={shapeRef}
            x={object.x}
            y={object.y}
            width={object.width}
            text={object.text || 'Double-click to edit'}
            fontSize={object.fontSize || 24}
            fontFamily={object.fontFamily || 'Arial'}
            fontStyle={object.fontStyle || 'normal'}
            fill={object.fill}
            opacity={object.opacity ?? 1}
            align={object.textAlign || 'left'}
            rotation={object.rotation || 0}
            offsetX={object.width / 2}
            offsetY={(object.fontSize || 24) / 2}
            shadowEnabled={object.shadow || false}
            shadowBlur={object.shadow ? 15 : 0}
            shadowOffset={object.shadow ? { x: 5, y: 5 } : { x: 0, y: 0 }}
            shadowOpacity={object.shadow ? 0.5 : 0}
            draggable
            onClick={handleClick}
            onDblClick={handleDoubleClick}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
          />
        );
      case 'group':
        return (
          <Rect
            id={`shape-${object.id}`}
            ref={shapeRef}
            x={object.x}
            y={object.y}
            width={object.width}
            height={object.height}
            offsetX={object.width / 2}
            offsetY={object.height / 2}
            fill="transparent"
            stroke={isSelected ? "rgba(59, 130, 246, 0.3)" : "transparent"}
            strokeWidth={isSelected ? 2 : 0}
            dash={isSelected ? [8, 4] : undefined}
            draggable
            onClick={handleClick}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onTransform={handleTransform}
            onTransformEnd={handleTransformEnd}
          />
        );
      default:
        return null;
    }
  };

  return (
    <>
      {renderShape()}
      {/* Only show transformer for single selection (not multi-select) */}
      {isSelected && selectedIds.length === 1 && object.type !== 'line' && <Transformer ref={transformerRef} />}
    </>
  );
};

export default CanvasObject;