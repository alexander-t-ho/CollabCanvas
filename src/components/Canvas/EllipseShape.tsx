import React, { useRef, useEffect } from 'react';
import { Ellipse, Group, Transformer } from 'react-konva';
import Konva from 'konva';
import { useCanvas } from '../../contexts/CanvasContext';
import { CanvasObject } from '../../types';

interface EllipseShapeProps {
  object: CanvasObject;
  isSelected: boolean;
  onDrag?: (position: { x: number; y: number }) => void;
  onDragEnd?: () => void;
}

const EllipseShape: React.FC<EllipseShapeProps> = ({ object, isSelected, onDrag, onDragEnd }) => {
  const { updateObject, selectObject, selectedIds, addToSelection, removeFromSelection } = useCanvas();
  const groupRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);

  // Attach transformer when selected
  useEffect(() => {
    if (isSelected && transformerRef.current && groupRef.current) {
      transformerRef.current.nodes([groupRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const radiusX = object.radiusX || object.width / 2;
  const radiusY = object.radiusY || object.height / 2;

  const handleClick = (e: any) => {
    e.cancelBubble = true;
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

  const handleTransform = (e: any) => {
    const node = groupRef.current;
    if (!node) return;

    const rotation = node.rotation();
    
    if (e.evt?.shiftKey) {
      const snappedRotation = Math.round(rotation / 45) * 45;
      node.rotation(snappedRotation);
    }
    
    // Get scale
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    
    // Update radii based on scale
    if (scaleX !== 1 || scaleY !== 1) {
      updateObject(object.id, {
        radiusX: Math.round(radiusX * scaleX),
        radiusY: Math.round(radiusY * scaleY),
        width: radiusX * scaleX * 2,
        height: radiusY * scaleY * 2
      });
      
      // Reset scale to prevent compound scaling
      node.scaleX(1);
      node.scaleY(1);
    }
  };

  const handleTransformEnd = (e: any) => {
    const node = groupRef.current;
    if (!node) return;

    let rotation = node.rotation();
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    if (e.evt?.shiftKey) {
      rotation = Math.round(rotation / 45) * 45;
    }

    const updates: any = {
      rotation: Math.round(rotation)
    };

    // Apply final scale if changed
    if (scaleX !== 1 || scaleY !== 1) {
      updates.radiusX = Math.round(radiusX * scaleX);
      updates.radiusY = Math.round(radiusY * scaleY);
      updates.width = Math.round(radiusX * scaleX * 2);
      updates.height = Math.round(radiusY * scaleY * 2);
      
      // Reset scale
      node.scaleX(1);
      node.scaleY(1);
    }

    updateObject(object.id, updates);
    // History is automatically saved by updateObject command
  };

  return (
    <>
      <Group
        id={`shape-${object.id}`}
        ref={groupRef}
        x={object.x}
        y={object.y}
        rotation={object.rotation || 0}
        draggable
        onClick={handleClick}
        onDragMove={(e: Konva.KonvaEventObject<DragEvent>) => {
          if (onDrag) {
            onDrag({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => {
          updateObject(object.id, {
            x: Math.round(e.target.x()),
            y: Math.round(e.target.y())
          });
          
          if (onDragEnd) {
            onDragEnd();
          }
          
          // History is automatically saved by updateObject command
        }}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        {/* Ellipse shape */}
        <Ellipse
          radiusX={radiusX}
          radiusY={radiusY}
          fill={object.fill}
          opacity={object.opacity ?? 1}
          shadowEnabled={object.shadow || false}
          shadowBlur={object.shadow ? 15 : 0}
          shadowOffset={object.shadow ? { x: 5, y: 5 } : { x: 0, y: 0 }}
          shadowOpacity={object.shadow ? 0.5 : 0}
        />

      </Group>
      
      {/* Transformer for rotation and resize - only for single selection */}
      {isSelected && selectedIds.length === 1 && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          resizeEnabled={true}
          borderEnabled={true}
          borderStroke="#3b82f6"
          borderStrokeWidth={2}
          anchorSize={8}
          anchorStroke="#3b82f6"
          anchorFill="#ffffff"
          anchorCornerRadius={2}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          keepRatio={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'middle-right', 'bottom-center', 'middle-left']}
        />
      )}
    </>
  );
};

export default EllipseShape;

