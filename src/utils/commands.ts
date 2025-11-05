import { CanvasObject } from '../types';

/**
 * Base interface for all commands
 * Each command knows how to execute and reverse itself
 */
export interface Command {
  /** Execute the command (forward operation) */
  execute(): Promise<void>;
  
  /** Reverse the command (undo operation) */
  undo(): Promise<void>;
  
  /** Get a description of what this command does */
  getDescription(): string;
  
  /** Timestamp when command was created */
  timestamp: number;
  
  /** Object type affected by this command */
  objectType?: string;
  
  /** Position data for undo/redo tracking */
  position?: { x: number; y: number };
  
  /** Object ID affected */
  objectId?: string;
}

/**
 * Command to add an object to the canvas
 */
export class AddObjectCommand implements Command {
  timestamp: number;
  objectType: string;
  objectId: string;
  position: { x: number; y: number };

  constructor(
    private object: CanvasObject,
    private addToFirestore: (obj: CanvasObject) => Promise<void>,
    private removeFromFirestore: (id: string) => Promise<void>,
    private updateLocalState: (updater: (prev: CanvasObject[]) => CanvasObject[]) => void
  ) {
    this.timestamp = Date.now();
    this.objectType = object.type;
    this.objectId = object.id;
    this.position = { x: object.x, y: object.y };
  }

  async execute(): Promise<void> {
    console.log(`▶️ EXECUTE: ${this.getDescription()}`);
    // Update local state immediately
    this.updateLocalState(prev => {
      if (prev.find(obj => obj.id === this.object.id)) {
        console.log(`⚠️ EXECUTE: Object ${this.object.id} already exists, skipping`);
        return prev; // Already exists
      }
      console.log(`✅ EXECUTE: Added object ${this.object.id} to local state`);
      return [...prev, this.object];
    });
    
    // Update Firestore
    await this.addToFirestore(this.object);
  }

  async undo(): Promise<void> {
    console.log(`⏪ UNDO: ${this.getDescription()}`);
    // Update local state immediately
    this.updateLocalState(prev => {
      const filtered = prev.filter(obj => obj.id !== this.object.id);
      console.log(`✅ UNDO: Removed object ${this.object.id} from local state (${prev.length} → ${filtered.length})`);
      return filtered;
    });
    
    // Update Firestore
    await this.removeFromFirestore(this.object.id);
  }

  getDescription(): string {
    return `Add ${this.object.type} at (${Math.round(this.object.x)}, ${Math.round(this.object.y)})`;
  }
}

/**
 * Command to delete an object from the canvas
 */
export class DeleteObjectCommand implements Command {
  timestamp: number;
  objectType: string;
  objectId: string;
  position: { x: number; y: number };

  constructor(
    private object: CanvasObject,
    private removeFromFirestore: (id: string) => Promise<void>,
    private addToFirestore: (obj: CanvasObject) => Promise<void>,
    private updateLocalState: (updater: (prev: CanvasObject[]) => CanvasObject[]) => void
  ) {
    this.timestamp = Date.now();
    this.objectType = object.type;
    this.objectId = object.id;
    this.position = { x: object.x, y: object.y };
  }

  async execute(): Promise<void> {
    console.log(`▶️ EXECUTE: ${this.getDescription()}`);
    // Update local state immediately
    this.updateLocalState(prev => {
      const filtered = prev.filter(obj => obj.id !== this.object.id);
      console.log(`✅ EXECUTE: Removed object ${this.object.id} from local state (${prev.length} → ${filtered.length})`);
      return filtered;
    });
    
    // Update Firestore
    await this.removeFromFirestore(this.object.id);
  }

  async undo(): Promise<void> {
    console.log(`⏪ UNDO: ${this.getDescription()}`);
    // Update local state immediately
    this.updateLocalState(prev => {
      if (prev.find(obj => obj.id === this.object.id)) {
        console.log(`⚠️ UNDO: Object ${this.object.id} already exists, skipping`);
        return prev; // Already exists
      }
      console.log(`✅ UNDO: Restored object ${this.object.id} to local state (${prev.length} → ${prev.length + 1})`);
      return [...prev, this.object];
    });
    
    // Update Firestore
    await this.addToFirestore(this.object);
  }

  getDescription(): string {
    return `Delete ${this.object.type} from (${Math.round(this.object.x)}, ${Math.round(this.object.y)})`;
  }
}

/**
 * Command to update an object's properties
 */
export class UpdateObjectCommand implements Command {
  timestamp: number;
  objectId: string;
  objectType?: string;
  position?: { x: number; y: number };
  previousPosition?: { x: number; y: number };
  
  // Detailed change tracking
  private changeDetails: Array<{ property: string; before: any; after: any }> = [];

  constructor(
    objectId: string,
    private updates: Partial<CanvasObject>,
    private previousState: Partial<CanvasObject>,
    private updateInFirestore: (id: string, updates: Partial<CanvasObject>) => Promise<void>,
    private updateLocalState: (updater: (prev: CanvasObject[]) => CanvasObject[]) => void,
    private getCurrentObject: () => CanvasObject | undefined
  ) {
    this.timestamp = Date.now();
    this.objectId = objectId;
    
    // Extract position data
    if (updates.x !== undefined || updates.y !== undefined) {
      this.position = {
        x: updates.x ?? previousState.x ?? 0,
        y: updates.y ?? previousState.y ?? 0
      };
      this.previousPosition = {
        x: previousState.x ?? 0,
        y: previousState.y ?? 0
      };
    }
    
    // Extract object type from current object
    const currentObj = this.getCurrentObject();
    if (currentObj) {
      this.objectType = currentObj.type;
    }
    
    // Build detailed change tracking
    this.buildChangeDetails();
  }
  
  private buildChangeDetails(): void {
    // Track all property changes with before/after values
    Object.keys(this.updates).forEach(key => {
      const newValue = (this.updates as any)[key];
      const oldValue = (this.previousState as any)[key];
      
      // Only track if value actually changed (or was undefined before)
      if (newValue !== oldValue) {
        this.changeDetails.push({
          property: key,
          before: oldValue,
          after: newValue
        });
      }
    });
  }

  async execute(): Promise<void> {
    console.log(`▶️ EXECUTE: ${this.getDescription()}`);
    // Update local state immediately
    this.updateLocalState(prev => {
      const updated = prev.map(obj => 
        obj.id === this.objectId 
          ? { ...obj, ...this.updates, lastModified: Date.now() }
          : obj
      );
      const obj = updated.find(o => o.id === this.objectId);
      if (obj && this.position) {
        console.log(`✅ EXECUTE: Updated object ${this.objectId} to position (${Math.round(obj.x)}, ${Math.round(obj.y)})`);
      } else {
        console.log(`✅ EXECUTE: Updated object ${this.objectId}`);
      }
      return updated;
    });
    
    // Update Firestore
    await this.updateInFirestore(this.objectId, this.updates);
  }

  async undo(): Promise<void> {
    console.log(`⏪ UNDO: ${this.getDescription()}`);
    // Update local state immediately
    this.updateLocalState(prev => {
      const updated = prev.map(obj => 
        obj.id === this.objectId 
          ? { ...obj, ...this.previousState, lastModified: Date.now() }
          : obj
      );
      const obj = updated.find(o => o.id === this.objectId);
      if (obj && this.previousPosition) {
        console.log(`✅ UNDO: Restored object ${this.objectId} to position (${Math.round(obj.x)}, ${Math.round(obj.y)})`);
      } else {
        console.log(`✅ UNDO: Restored object ${this.objectId}`);
      }
      return updated;
    });
    
    // Update Firestore
    await this.updateInFirestore(this.objectId, this.previousState);
  }

  private formatPropertyValue(property: string, value: any): string {
    if (value === undefined || value === null) {
      return 'none';
    }
    
    switch (property) {
      case 'fill':
        return value; // Color hex code
      case 'opacity':
        return `${Math.round((value ?? 1) * 100)}%`;
      case 'rotation':
        return `${Math.round(value ?? 0)}°`;
      case 'cornerRadius':
        return `${Math.round(value ?? 0)}px`;
      case 'strokeWidth':
        return `${Math.round(value ?? 3)}px`;
      case 'width':
      case 'height':
        return `${Math.round(value ?? 0)}px`;
      case 'shadow':
        return value ? 'on' : 'off';
      case 'arrowStart':
      case 'arrowEnd':
        return value ? 'yes' : 'no';
      case 'curved':
        return value ? 'curved' : 'straight';
      case 'fontSize':
        return `${Math.round(value ?? 12)}pt`;
      case 'nickname':
        return value || '(empty)';
      case 'text':
        const textStr = String(value);
        return textStr.length > 20 ? textStr.substring(0, 20) + '...' : textStr || '(empty)';
      case 'sides':
        return `${value} sides`;
      case 'sideLength':
        return `${Math.round(value ?? 0)}px`;
      case 'radiusX':
      case 'radiusY':
        return `${Math.round(value ?? 0)}px`;
      case 'zIndex':
        return `z:${value}`;
      case 'x':
      case 'y':
      case 'x2':
      case 'y2':
      case 'controlX':
      case 'controlY':
        return `${Math.round(value ?? 0)}`;
      default:
        return String(value);
    }
  }

  getDescription(): string {
    if (this.changeDetails.length === 0) {
      return `Update ${this.objectType || 'object'}`;
    }
    
    const parts: string[] = [];
    
    // Position changes (most common)
    const positionChange = this.position && this.previousPosition 
      ? `Position: (${Math.round(this.previousPosition.x)}, ${Math.round(this.previousPosition.y)}) → (${Math.round(this.position.x)}, ${Math.round(this.position.y)})`
      : null;
    
    if (positionChange) {
      parts.push(positionChange);
    }
    
    // Color changes
    const fillChange = this.changeDetails.find(c => c.property === 'fill');
    if (fillChange) {
      parts.push(`Color: ${fillChange.before || '#000000'} → ${fillChange.after || '#000000'}`);
    }
    
    // Opacity changes
    const opacityChange = this.changeDetails.find(c => c.property === 'opacity');
    if (opacityChange) {
      const before = this.formatPropertyValue('opacity', opacityChange.before);
      const after = this.formatPropertyValue('opacity', opacityChange.after);
      parts.push(`Opacity: ${before} → ${after}`);
    }
    
    // Rotation changes
    const rotationChange = this.changeDetails.find(c => c.property === 'rotation');
    if (rotationChange) {
      const before = this.formatPropertyValue('rotation', rotationChange.before);
      const after = this.formatPropertyValue('rotation', rotationChange.after);
      parts.push(`Rotation: ${before} → ${after}`);
    }
    
    // Shadow changes
    const shadowChange = this.changeDetails.find(c => c.property === 'shadow');
    if (shadowChange) {
      parts.push(`Shadow: ${shadowChange.before ? 'on' : 'off'} → ${shadowChange.after ? 'on' : 'off'}`);
    }
    
    // Corner radius changes (rectangle-specific)
    const cornerRadiusChange = this.changeDetails.find(c => c.property === 'cornerRadius');
    if (cornerRadiusChange) {
      const before = this.formatPropertyValue('cornerRadius', cornerRadiusChange.before);
      const after = this.formatPropertyValue('cornerRadius', cornerRadiusChange.after);
      parts.push(`Corner Radius: ${before} → ${after}`);
    }
    
    // Width/Height changes
    const widthChange = this.changeDetails.find(c => c.property === 'width');
    if (widthChange) {
      const before = this.formatPropertyValue('width', widthChange.before);
      const after = this.formatPropertyValue('width', widthChange.after);
      parts.push(`Width: ${before} → ${after}`);
    }
    
    const heightChange = this.changeDetails.find(c => c.property === 'height');
    if (heightChange) {
      const before = this.formatPropertyValue('height', heightChange.before);
      const after = this.formatPropertyValue('height', heightChange.after);
      parts.push(`Height: ${before} → ${after}`);
    }
    
    // Stroke width changes (line-specific)
    const strokeWidthChange = this.changeDetails.find(c => c.property === 'strokeWidth');
    if (strokeWidthChange) {
      const before = this.formatPropertyValue('strokeWidth', strokeWidthChange.before);
      const after = this.formatPropertyValue('strokeWidth', strokeWidthChange.after);
      parts.push(`Line Thickness: ${before} → ${after}`);
    }
    
    // Arrow changes (line-specific)
    const arrowStartChange = this.changeDetails.find(c => c.property === 'arrowStart');
    if (arrowStartChange) {
      parts.push(`Start Arrow: ${arrowStartChange.before ? 'yes' : 'no'} → ${arrowStartChange.after ? 'yes' : 'no'}`);
    }
    
    const arrowEndChange = this.changeDetails.find(c => c.property === 'arrowEnd');
    if (arrowEndChange) {
      parts.push(`End Arrow: ${arrowEndChange.before ? 'yes' : 'no'} → ${arrowEndChange.after ? 'yes' : 'no'}`);
    }
    
    // Text changes
    const textChange = this.changeDetails.find(c => c.property === 'text');
    if (textChange) {
      const before = this.formatPropertyValue('text', textChange.before);
      const after = this.formatPropertyValue('text', textChange.after);
      parts.push(`Text: "${before}" → "${after}"`);
    }
    
    // Font changes
    const fontSizeChange = this.changeDetails.find(c => c.property === 'fontSize');
    if (fontSizeChange) {
      const before = this.formatPropertyValue('fontSize', fontSizeChange.before);
      const after = this.formatPropertyValue('fontSize', fontSizeChange.after);
      parts.push(`Font Size: ${before} → ${after}`);
    }
    
    const fontFamilyChange = this.changeDetails.find(c => c.property === 'fontFamily');
    if (fontFamilyChange) {
      parts.push(`Font: ${fontFamilyChange.before || 'default'} → ${fontFamilyChange.after || 'default'}`);
    }
    
    const fontStyleChange = this.changeDetails.find(c => c.property === 'fontStyle');
    if (fontStyleChange) {
      parts.push(`Font Style: ${fontStyleChange.before || 'normal'} → ${fontStyleChange.after || 'normal'}`);
    }
    
    // Nickname changes
    const nicknameChange = this.changeDetails.find(c => c.property === 'nickname');
    if (nicknameChange) {
      const before = this.formatPropertyValue('nickname', nicknameChange.before);
      const after = this.formatPropertyValue('nickname', nicknameChange.after);
      parts.push(`Nickname: "${before}" → "${after}"`);
    }
    
    // Polygon-specific changes
    const sidesChange = this.changeDetails.find(c => c.property === 'sides');
    if (sidesChange) {
      parts.push(`Sides: ${sidesChange.before || 3} → ${sidesChange.after || 3}`);
    }
    
    // Z-index changes
    const zIndexChange = this.changeDetails.find(c => c.property === 'zIndex');
    if (zIndexChange) {
      parts.push(`Layer: ${zIndexChange.before ?? 0} → ${zIndexChange.after ?? 0}`);
    }
    
    // Line point changes (x2, y2, controlX, controlY)
    const x2Change = this.changeDetails.find(c => c.property === 'x2');
    const y2Change = this.changeDetails.find(c => c.property === 'y2');
    if (x2Change || y2Change) {
      const beforeX2 = x2Change ? this.formatPropertyValue('x2', x2Change.before) : this.formatPropertyValue('x2', (this.previousState as any).x2);
      const afterX2 = x2Change ? this.formatPropertyValue('x2', x2Change.after) : this.formatPropertyValue('x2', (this.previousState as any).x2);
      const beforeY2 = y2Change ? this.formatPropertyValue('y2', y2Change.before) : this.formatPropertyValue('y2', (this.previousState as any).y2);
      const afterY2 = y2Change ? this.formatPropertyValue('y2', y2Change.after) : this.formatPropertyValue('y2', (this.previousState as any).y2);
      parts.push(`End Point: (${beforeX2}, ${beforeY2}) → (${afterX2}, ${afterY2})`);
    }
    
    const controlXChange = this.changeDetails.find(c => c.property === 'controlX');
    const controlYChange = this.changeDetails.find(c => c.property === 'controlY');
    if (controlXChange || controlYChange) {
      const beforeCX = controlXChange ? this.formatPropertyValue('controlX', controlXChange.before) : this.formatPropertyValue('controlX', (this.previousState as any).controlX);
      const afterCX = controlXChange ? this.formatPropertyValue('controlX', controlXChange.after) : this.formatPropertyValue('controlX', (this.previousState as any).controlX);
      const beforeCY = controlYChange ? this.formatPropertyValue('controlY', controlYChange.before) : this.formatPropertyValue('controlY', (this.previousState as any).controlY);
      const afterCY = controlYChange ? this.formatPropertyValue('controlY', controlYChange.after) : this.formatPropertyValue('controlY', (this.previousState as any).controlY);
      parts.push(`Control Point: (${beforeCX}, ${beforeCY}) → (${afterCX}, ${afterCY})`);
    }
    
    // Polygon vertex changes (customVertices)
    const customVerticesChange = this.changeDetails.find(c => c.property === 'customVertices');
    if (customVerticesChange) {
      const beforeVertices = Array.isArray(customVerticesChange.before) ? customVerticesChange.before.length : 0;
      const afterVertices = Array.isArray(customVerticesChange.after) ? customVerticesChange.after.length : 0;
      if (beforeVertices !== afterVertices || (beforeVertices > 0 && afterVertices > 0)) {
        parts.push(`Vertices: ${beforeVertices} → ${afterVertices} points edited`);
      }
    }
    
    // Other properties not explicitly handled above
    const handledProperties = new Set([
      'x', 'y', 'fill', 'opacity', 'rotation', 'shadow', 'cornerRadius',
      'width', 'height', 'strokeWidth', 'arrowStart', 'arrowEnd',
      'text', 'fontSize', 'fontFamily', 'fontStyle', 'nickname',
      'sides', 'zIndex', 'x2', 'y2', 'controlX', 'controlY', 'customVertices'
    ]);
    
    const otherChanges = this.changeDetails.filter(c => !handledProperties.has(c.property));
    if (otherChanges.length > 0) {
      otherChanges.forEach(change => {
        const before = this.formatPropertyValue(change.property, change.before);
        const after = this.formatPropertyValue(change.property, change.after);
        const propName = change.property.charAt(0).toUpperCase() + change.property.slice(1);
        parts.push(`${propName}: ${before} → ${after}`);
      });
    }
    
    const typeLabel = this.objectType || 'object';
    if (parts.length === 0) {
      return `Update ${typeLabel}`;
    }
    
    // Limit to first 5 changes to avoid overly long descriptions
    const displayParts = parts.slice(0, 5);
    const remaining = parts.length - displayParts.length;
    const suffix = remaining > 0 ? ` +${remaining} more` : '';
    
    return `Update ${typeLabel}: ${displayParts.join(', ')}${suffix}`;
  }
}

/**
 * Command to update multiple objects at once
 */
export class UpdateMultipleObjectsCommand implements Command {
  timestamp: number;
  objectType?: string;
  private commands: UpdateObjectCommand[];

  constructor(
    updates: Array<{ id: string; updates: Partial<CanvasObject>; previousState: Partial<CanvasObject> }>,
    updateInFirestore: (id: string, updates: Partial<CanvasObject>) => Promise<void>,
    updateLocalState: (updater: (prev: CanvasObject[]) => CanvasObject[]) => void,
    getCurrentObject: (id: string) => CanvasObject | undefined
  ) {
    this.timestamp = Date.now();
    this.commands = updates.map(u => 
      new UpdateObjectCommand(u.id, u.updates, u.previousState, updateInFirestore, updateLocalState, () => getCurrentObject(u.id))
    );
    
    // Get object type from first command
    if (this.commands.length > 0) {
      this.objectType = this.commands[0].objectType;
    }
  }

  async execute(): Promise<void> {
    await Promise.all(this.commands.map(cmd => cmd.execute()));
  }

  async undo(): Promise<void> {
    // Undo in reverse order
    for (let i = this.commands.length - 1; i >= 0; i--) {
      await this.commands[i].undo();
    }
  }

  getDescription(): string {
    return `Update ${this.commands.length} ${this.objectType || 'objects'}`;
  }
}

/**
 * Command to create a group
 */
export class CreateGroupCommand implements Command {
  timestamp: number;
  objectType: string;
  objectId: string;
  position: { x: number; y: number };

  constructor(
    private groupObject: CanvasObject,
    private groupedObjectIds: string[],
    private addToFirestore: (obj: CanvasObject) => Promise<void>,
    private removeFromFirestore: (id: string) => Promise<void>,
    private updateLocalState: (updater: (prev: CanvasObject[]) => CanvasObject[]) => void
  ) {
    this.timestamp = Date.now();
    this.objectType = 'group';
    this.objectId = groupObject.id;
    this.position = { x: groupObject.x, y: groupObject.y };
  }

  async execute(): Promise<void> {
    // Update local state immediately
    this.updateLocalState(prev => {
      if (prev.find(obj => obj.id === this.groupObject.id)) {
        return prev; // Already exists
      }
      return [...prev, this.groupObject];
    });
    
    // Update Firestore
    await this.addToFirestore(this.groupObject);
  }

  async undo(): Promise<void> {
    // Update local state immediately
    this.updateLocalState(prev => prev.filter(obj => obj.id !== this.groupObject.id));
    
    // Update Firestore
    await this.removeFromFirestore(this.groupObject.id);
  }

  getDescription(): string {
    return `Create group of ${this.groupedObjectIds.length} objects at (${Math.round(this.groupObject.x)}, ${Math.round(this.groupObject.y)})`;
  }
}

/**
 * Command history manager
 * Manages the undo/redo stack
 */
export class CommandHistory {
  private history: Command[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 100;

  /**
   * Add a command to the history and execute it
   */
  async executeCommand(command: Command): Promise<void> {
    // Remove any commands after current index (for redo)
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new command
    this.history.push(command);
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }

    // Execute the command
    await command.execute();
  }

  /**
   * Undo the last command
   */
  async undo(): Promise<boolean> {
    if (!this.canUndo()) {
      return false;
    }

    const command = this.history[this.currentIndex];
    await command.undo();
    this.currentIndex--;

    return true;
  }

  /**
   * Redo the last undone command
   */
  async redo(): Promise<boolean> {
    if (!this.canRedo()) {
      return false;
    }

    this.currentIndex++;
    const command = this.history[this.currentIndex];
    await command.execute();

    return true;
  }

  /**
   * Check if undo is possible
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * Check if redo is possible
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Get the current history state (for debugging)
   */
  getHistory(): Command[] {
    return [...this.history];
  }

  /**
   * Get current index
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }
}

