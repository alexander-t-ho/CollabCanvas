import React, { useRef, useState, useEffect } from 'react';
import { Group, Line, Circle, Arrow } from 'react-konva';
import Konva from 'konva';
import { CanvasObject } from '../../types';
import { useCanvas } from '../../contexts/CanvasContext';

interface Props {
  object: CanvasObject;
  isSelected: boolean;
}

const InteractiveLine: React.FC<Props> = ({ object, isSelected }) => {
  const { updateObject, updateObjectLive, selectObject, selectedIds, addToSelection, removeFromSelection } = useCanvas();
  const groupRef = useRef<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'start' | 'end' | 'control' | null>(null);

  const startX = object.x;
  const startY = object.y;
  const endX = object.x2 || object.x + object.width;
  const endY = object.y2 || object.y;
  
  // Default control point to line midpoint unless explicitly set and curved
  const defaultControlX = (startX + endX) / 2;
  const defaultControlY = (startY + endY) / 2;
  const controlX = object.curved && object.controlX !== undefined ? object.controlX : defaultControlX;
  const controlY = object.curved && object.controlY !== undefined ? object.controlY : defaultControlY;

  // Handle keyboard events for shift key detection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && isDragging && (dragType === 'start' || dragType === 'end')) {
        // Force orthogonal snapping during drag
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && isDragging && (dragType === 'start' || dragType === 'end')) {
        // Release orthogonal constraint
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isDragging, dragType]);

  // Snap to orthogonal angles (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)
  const snapToOrthogonal = (fromX: number, fromY: number, toX: number, toY: number) => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return { x: toX, y: toY };
    
    // Calculate angle in degrees
    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    
    // Snap to nearest 45-degree increment
    const snapAngle = Math.round(angle / 45) * 45;
    const radians = snapAngle * Math.PI / 180;
    
    return {
      x: fromX + Math.cos(radians) * length,
      y: fromY + Math.sin(radians) * length
    };
  };

  // Handle dragging control points with real-time updates
  const handleControlPointDragStart = (pointType: 'start' | 'end' | 'control') => (e: any) => {
    e.cancelBubble = true; // Prevent event from bubbling to Group
    setIsDragging(true);
    setDragType(pointType);
    // console.log('🔥 LINE: Started dragging', pointType, 'point');
  };

  const handleControlPointDragMove = (pointType: 'start' | 'end' | 'control') => (e: any) => {
    e.cancelBubble = true; // Prevent event from bubbling to Group
    
    const newX = e.target.x();
    const newY = e.target.y();
    const isShiftPressed = e.evt?.shiftKey || false;

    // Use updateObjectLive for real-time feedback during drag (no history)
    switch (pointType) {
      case 'start':
        // Only update the start point, keep end point locked
        if (isShiftPressed) {
          const snapped = snapToOrthogonal(endX, endY, newX, newY);
          updateObjectLive(object.id, { x: snapped.x, y: snapped.y });
        } else {
          updateObjectLive(object.id, { x: newX, y: newY });
        }
        break;
      case 'end':
        // Only update the end point, keep start point locked
        if (isShiftPressed) {
          const snapped = snapToOrthogonal(startX, startY, newX, newY);
          updateObjectLive(object.id, { x2: snapped.x, y2: snapped.y });
        } else {
          updateObjectLive(object.id, { x2: newX, y2: newY });
        }
        break;
      case 'control':
        // Control point ONLY affects the curve, does NOT move line endpoints
        // If Shift is pressed, align control point with the line (straighten)
        if (isShiftPressed) {
          // Align control point with the line (midpoint between endpoints)
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          // console.log('🔥 LINE: Shift pressed - aligning control point to midpoint', midX, midY);
          updateObjectLive(object.id, { 
            controlX: midX, 
            controlY: midY,
            curved: false // Straighten the line
          });
        } else {
          // console.log('🔥 LINE: Moving control point to', newX, newY);
          updateObjectLive(object.id, { 
            controlX: newX, 
            controlY: newY,
            curved: true 
          });
        }
        break;
    }
  };

  const handleControlPointDragEnd = (pointType: 'start' | 'end' | 'control') => (e: any) => {
    e.cancelBubble = true; // Prevent event from bubbling to Group
    // console.log('🔥 LINE: Finished dragging', pointType, 'point');
    setIsDragging(false);
    setDragType(null);
    
    const newX = e.target.x();
    const newY = e.target.y();
    const isShiftPressed = e.evt?.shiftKey || false;

    switch (pointType) {
      case 'start':
        if (isShiftPressed) {
          const snapped = snapToOrthogonal(endX, endY, newX, newY);
          updateObject(object.id, { x: snapped.x, y: snapped.y });
        } else {
          updateObject(object.id, { x: newX, y: newY });
        }
        break;
      case 'end':
        if (isShiftPressed) {
          const snapped = snapToOrthogonal(startX, startY, newX, newY);
          updateObject(object.id, { x2: snapped.x, y2: snapped.y });
        } else {
          updateObject(object.id, { x2: newX, y2: newY });
        }
        break;
      case 'control':
        // If Shift was pressed, align to midpoint (straighten)
        if (isShiftPressed) {
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          updateObject(object.id, { 
            controlX: midX, 
            controlY: midY,
            curved: false
          });
        } else {
          // Normal curve update
          updateObject(object.id, { 
            controlX: newX, 
            controlY: newY,
            curved: true 
          });
        }
        break;
      }
      
      // Save to history after line point drag ends
      // History is automatically saved by updateObject command
    };

  // Handle dragging the entire line (only when clicking on the line itself, not control points)
  const handleLineDragEnd = (e: any) => {
    try {
      const deltaX = e.target.x();
      const deltaY = e.target.y();
      
      // Build update object based on what exists
      const updates: Partial<CanvasObject> = {
        x: startX + deltaX,
        y: startY + deltaY,
        x2: endX + deltaX,
        y2: endY + deltaY,
      };
      
      // Only update control point if line is curved and has control point data
      if (object.curved && object.controlX !== undefined && object.controlY !== undefined) {
        updates.controlX = object.controlX + deltaX;
        updates.controlY = object.controlY + deltaY;
      }
      
      // console.log('🔥 LINE: Moving entire line by', deltaX, deltaY, 'with updates:', updates);
      updateObject(object.id, updates);

      // Reset the group position
      e.target.x(0);
      e.target.y(0);
      
      // Save to history after line drag ends
      // History is automatically saved by updateObject command
    } catch (error) {
      // console.error('❌ LINE: Error moving line:', error);
      // Reset position on error
      e.target.x(0);
      e.target.y(0);
    }
  };

  // Generate points for the line (straight or curved)
  const getLinePoints = () => {
    if (object.curved && object.controlX !== undefined && object.controlY !== undefined) {
      // Generate points for quadratic curve
      const points = [];
      const steps = 20;
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Quadratic Bézier curve formula
        const x = Math.pow(1 - t, 2) * startX + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * endX;
        const y = Math.pow(1 - t, 2) * startY + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * endY;
        points.push(x, y);
      }
      
      return points;
    } else {
      // Straight line
      return [startX, startY, endX, endY];
    }
  };

  const renderLine = () => {
    const points = getLinePoints();
    const hasArrows = object.arrowStart || object.arrowEnd;
    
    // If no arrows, use regular Line
    if (!hasArrows) {
      return (
        <Line
          points={points}
          stroke={object.fill}
          strokeWidth={object.strokeWidth || 3}
          opacity={object.opacity ?? 1}
          lineCap="round"
          lineJoin="round"
          tension={object.curved ? 0.5 : 0}
          shadowEnabled={object.shadow || false}
          shadowBlur={object.shadow ? 15 : 0}
          shadowOffset={object.shadow ? { x: 5, y: 5 } : { x: 0, y: 0 }}
          shadowOpacity={object.shadow ? 0.5 : 0}
        />
      );
    }
    
    // If arrows, we need to render them separately
    return (
      <>
        {/* Main line - use Arrow component from Konva */}
        <Line
          points={points}
          stroke={object.fill}
          strokeWidth={object.strokeWidth || 3}
          opacity={object.opacity ?? 1}
          lineCap="round"
          lineJoin="round"
          tension={object.curved ? 0.5 : 0}
          shadowEnabled={object.shadow || false}
          shadowBlur={object.shadow ? 15 : 0}
          shadowOffset={object.shadow ? { x: 5, y: 5 } : { x: 0, y: 0 }}
          shadowOpacity={object.shadow ? 0.5 : 0}
        />
        
        {/* Arrow at start */}
        {object.arrowStart && (
          <Arrow
            points={object.curved ? 
              [controlX, controlY, startX, startY] : 
              [endX, endY, startX, startY]
            }
            stroke={object.fill}
            fill={object.fill}
            strokeWidth={object.strokeWidth || 3}
            opacity={object.opacity ?? 1}
            pointerLength={10}
            pointerWidth={10}
          />
        )}
        
        {/* Arrow at end */}
        {object.arrowEnd && (
          <Arrow
            points={object.curved ? 
              [controlX, controlY, endX, endY] : 
              [startX, startY, endX, endY]
            }
            stroke={object.fill}
            fill={object.fill}
            strokeWidth={object.strokeWidth || 3}
            opacity={object.opacity ?? 1}
            pointerLength={10}
            pointerWidth={10}
          />
        )}
      </>
    );
  };

  const handleLineClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
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

  return (
    <Group
      ref={groupRef}
      draggable={!isDragging && dragType === null} // Only allow dragging when NO control points are being dragged
      onDragEnd={handleLineDragEnd}
      onClick={handleLineClick}
    >
      {renderLine()}
      
      {/* Control points - only show when selected */}
      {isSelected && (
        <>
          {/* Start point */}
          <Circle
            x={startX}
            y={startY}
            radius={8}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            draggable
            onDragStart={handleControlPointDragStart('start')}
            onDragMove={handleControlPointDragMove('start')}
            onDragEnd={handleControlPointDragEnd('start')}
            onMouseEnter={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.target.scale({ x: 1.2, y: 1.2 });
            }}
            onMouseLeave={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.target.scale({ x: 1, y: 1 });
            }}
          />
          
          {/* End point */}
          <Circle
            x={endX}
            y={endY}
            radius={8}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={2}
            draggable
            onDragStart={handleControlPointDragStart('end')}
            onDragMove={handleControlPointDragMove('end')}
            onDragEnd={handleControlPointDragEnd('end')}
            onMouseEnter={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.target.scale({ x: 1.2, y: 1.2 });
            }}
            onMouseLeave={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.target.scale({ x: 1, y: 1 });
            }}
          />
          
          {/* Control point (middle) - for curving only */}
          <Circle
            x={controlX}
            y={controlY}
            radius={8}
            fill={object.curved ? "#ef4444" : "#10b981"}
            stroke="white"
            strokeWidth={2}
            draggable
            onDragStart={handleControlPointDragStart('control')}
            onDragMove={handleControlPointDragMove('control')}
            onDragEnd={handleControlPointDragEnd('control')}
            onMouseEnter={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.target.scale({ x: 1.2, y: 1.2 });
            }}
            onMouseLeave={(e: Konva.KonvaEventObject<MouseEvent>) => {
              e.target.scale({ x: 1, y: 1 });
            }}
          />
          
          {/* Helper lines to control point */}
          <Line
            points={[startX, startY, controlX, controlY, endX, endY]}
            stroke="#94a3b8"
            strokeWidth={1}
            dash={[5, 5]}
            opacity={0.5}
          />
        </>
      )}
    </Group>
  );
};

export default InteractiveLine;
