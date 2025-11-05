import OpenAI from 'openai';
import { CanvasObject } from '../types';

// Get API key from environment
const apiKey = process.env.REACT_APP_OPENAI_API_KEY;

// Validate API key exists
if (!apiKey) {
  console.error('❌ OPENAI_API_KEY is not set in environment variables');
  console.error('Please set REACT_APP_OPENAI_API_KEY in your .env.local file');
} else {
  // Validate API key format (should start with 'sk-')
  if (!apiKey.startsWith('sk-')) {
    console.warn('⚠️ OPENAI_API_KEY format may be incorrect. Expected format: sk-...');
  } else {
    console.log('✅ OpenAI API key loaded successfully');
  }
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: apiKey || '', // Fallback to empty string if not set
  dangerouslyAllowBrowser: true // Only for demo - in production, use a backend
});

// Define the function schemas for the AI
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'createShape',
      description: 'Create a new shape (rectangle or circle) on the canvas',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['rectangle', 'circle'],
            description: 'The type of shape to create'
          },
          x: {
            type: 'number',
            description: 'X coordinate position (0 is center)'
          },
          y: {
            type: 'number',
            description: 'Y coordinate position (0 is center)'
          },
          width: {
            type: 'number',
            description: 'Width of the shape in pixels'
          },
          height: {
            type: 'number',
            description: 'Height of the shape in pixels'
          },
          color: {
            type: 'string',
            description: 'Hex color code (e.g., #FF0000 for red)'
          }
        },
        required: ['type', 'x', 'y', 'width', 'height', 'color']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createPolygon',
      description: 'Create a polygon shape (triangle, square, pentagon, hexagon, etc.) on the canvas. Use this for triangles (3 sides), pentagons (5 sides), hexagons (6 sides), and other polygons.',
      parameters: {
        type: 'object',
        properties: {
          sides: {
            type: 'number',
            description: 'Number of sides (3 = triangle, 4 = square, 5 = pentagon, 6 = hexagon, etc.). Minimum: 3, Maximum: 64.'
          },
          x: {
            type: 'number',
            description: 'X coordinate position (0 is center)'
          },
          y: {
            type: 'number',
            description: 'Y coordinate position (0 is center)'
          },
          sideLength: {
            type: 'number',
            description: 'Length of each side in pixels (default: 100). For triangles, use 100-150 for a good size.'
          },
          color: {
            type: 'string',
            description: 'Hex color code (e.g., #FF0000 for red)'
          },
          width: {
            type: 'number',
            description: 'Optional: Overall width of the polygon bounding box (auto-calculated if not provided)'
          },
          height: {
            type: 'number',
            description: 'Optional: Overall height of the polygon bounding box (auto-calculated if not provided)'
          }
        },
        required: ['sides', 'x', 'y', 'color']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createButton',
      description: 'Create a button (rectangle background + text label). Use this when user says "add a button".',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'Button label text (e.g., "Sign Up", "Submit", "Cancel")'
          },
          x: {
            type: 'number',
            description: 'X coordinate position (0 is center)'
          },
          y: {
            type: 'number',
            description: 'Y coordinate position (0 is center)'
          },
          width: {
            type: 'number',
            description: 'Button width in pixels (default: 200)'
          },
          height: {
            type: 'number',
            description: 'Button height in pixels (default: 50)'
          },
          color: {
            type: 'string',
            description: 'Button background color as hex (default: #3b82f6)'
          },
          textColor: {
            type: 'string',
            description: 'Text color as hex (default: #ffffff)'
          }
        },
        required: ['text', 'x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createLine',
      description: 'Create a line or curve on the canvas. Can be straight or curved with control point.',
      parameters: {
        type: 'object',
        properties: {
          x1: {
            type: 'number',
            description: 'Start X coordinate'
          },
          y1: {
            type: 'number',
            description: 'Start Y coordinate'
          },
          x2: {
            type: 'number',
            description: 'End X coordinate'
          },
          y2: {
            type: 'number',
            description: 'End Y coordinate'
          },
          curved: {
            type: 'boolean',
            description: 'Whether the line is curved (true) or straight (false). Default: false'
          },
          curvature: {
            type: 'number',
            description: 'For curved lines: how much to curve. Positive = curve up, negative = curve down. Range: -100 to 100. Default: 0'
          },
          color: {
            type: 'string',
            description: 'Line color as hex code (default: random)'
          },
          strokeWidth: {
            type: 'number',
            description: 'Line thickness in pixels (default: 3)'
          }
        },
        required: ['x1', 'y1', 'x2', 'y2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createText',
      description: 'Create a text element on the canvas',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The text content to display'
          },
          x: {
            type: 'number',
            description: 'X coordinate position (0 is center)'
          },
          y: {
            type: 'number',
            description: 'Y coordinate position (0 is center)'
          },
          fontSize: {
            type: 'number',
            description: 'Font size in pixels (default: 24)'
          },
          color: {
            type: 'string',
            description: 'Hex color code for text (e.g., #000000 for black)'
          }
        },
        required: ['text', 'x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'moveShape',
      description: 'Move an existing shape to a new position on the X/Y plane',
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Description of the shape to move (e.g., "blue rectangle", "circle")'
          },
          x: {
            type: 'number',
            description: 'New X coordinate position'
          },
          y: {
            type: 'number',
            description: 'New Y coordinate position'
          }
        },
        required: ['identifier', 'x', 'y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'changeLayer',
      description: 'Change the z-index/layer of a shape (bring to front, send to back, move forward, move backward)',
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Description of the shape to layer (e.g., "blue circle", "rectangle")'
          },
          action: {
            type: 'string',
            enum: ['front', 'back', 'forward', 'backward'],
            description: 'Layer action: "front" (bring to front), "back" (send to back), "forward" (move up one layer), "backward" (move down one layer)'
          }
        },
        required: ['identifier', 'action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'modifyText',
      description: 'Modify properties of existing text (font size, color, content). Use this instead of creating new text when user says "change the font size", "make it bigger", "change the text", etc.',
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Description of the text to modify (e.g., "forgot password", "title", "the text")'
          },
          fontSize: {
            type: 'number',
            description: 'New font size in pixels (optional)'
          },
          color: {
            type: 'string',
            description: 'New text color as hex code (optional)'
          },
          text: {
            type: 'string',
            description: 'New text content (optional)'
          }
        },
        required: ['identifier']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'resizeShape',
      description: 'Resize an existing shape to new dimensions. For "make X bigger/smaller by Y", calculate new size: if current size is 120 and user says "bigger by 50", use 170. For circles, width = diameter.',
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Description of the shape to resize (e.g., "blue circle", "rectangle")'
          },
          width: {
            type: 'number',
            description: 'New width in pixels (for circles, this is the diameter)'
          },
          height: {
            type: 'number',
            description: 'New height in pixels (for circles, use same as width)'
          }
        },
        required: ['identifier', 'width', 'height']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rotateShape',
      description: 'Rotate an existing shape',
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Description of the shape to rotate'
          },
          degrees: {
            type: 'number',
            description: 'Degrees to rotate (0-360)'
          }
        },
        required: ['identifier', 'degrees']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'arrangeShapes',
      description: 'Arrange multiple shapes in a pattern (horizontal, vertical, or grid). Spacing is center-to-center distance. Use filterType to specify which shapes to arrange (e.g., "circle", "rectangle", "polygon"). Use filterColor to filter by color.',
      parameters: {
        type: 'object',
        properties: {
          arrangement: {
            type: 'string',
            enum: ['horizontal', 'vertical', 'grid'],
            description: 'How to arrange the shapes'
          },
          filterType: {
            type: 'string',
            description: 'Optional: Filter shapes by type (e.g., "circle", "rectangle", "polygon", "ellipse"). If not specified, arranges all shapes.'
          },
          filterColor: {
            type: 'string',
            description: 'Optional: Filter shapes by color (hex code like "#FF0000" or color name like "red"). If specified with filterType, both must match.'
          },
          spacing: {
            type: 'number',
            description: 'Center-to-center space between shapes in pixels (default: 200 for visibility)'
          },
          startX: {
            type: 'number',
            description: 'Starting X position (default: -200)'
          },
          startY: {
            type: 'number',
            description: 'Starting Y position (default: 0)'
          }
        },
        required: ['arrangement']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createCustomShape',
      description: 'Create custom complex shapes like clouds, stars, hearts, trees, houses, etc. Stars are created as polygons with custom vertices.',
      parameters: {
        type: 'object',
        properties: {
          shapeName: {
            type: 'string',
            description: 'Name of the shape to create (e.g., "cloud", "star", "heart", "tree", "house", "sun", "flower")'
          },
          x: {
            type: 'number',
            description: 'Center X coordinate (default: 0)'
          },
          y: {
            type: 'number',
            description: 'Center Y coordinate (default: 0)'
          },
          scale: {
            type: 'number',
            description: 'Size scale factor (default: 1.0, larger = bigger shape)'
          },
          color: {
            type: 'string',
            description: 'Primary color for the shape (hex code)'
          },
          points: {
            type: 'number',
            description: 'For stars: number of points (default: 5). Example: 5-point star, 6-point star, 8-point star'
          }
        },
        required: ['shapeName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createComplex',
      description: 'Create complex UI elements like forms, navigation bars, or card layouts. NOTE: Objects are automatically grouped after creation. Use createCustomShape for non-UI shapes.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['login-form', 'nav-bar', 'card', 'button-group'],
            description: 'Type of UI element to create'
          },
          x: {
            type: 'number',
            description: 'X coordinate for center of the element (default: 0)'
          },
          y: {
            type: 'number',
            description: 'Y coordinate for center of the element (default: 0)'
          },
          options: {
            type: 'object',
            description: 'Additional options specific to the element type',
            properties: {
              itemCount: { type: 'number' },
              title: { type: 'string' },
              buttonLabels: { type: 'array', items: { type: 'string' } }
            }
          },
          autoGroup: {
            type: 'boolean',
            description: 'Automatically group all created elements (default: true)'
          }
        },
        required: ['type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createGroup',
      description: 'Group multiple objects together so they can be moved/rotated as one unit',
      parameters: {
        type: 'object',
        properties: {
          objectIdentifiers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of object identifiers to group (e.g., ["nav item 1", "nav item 2", "nav bar background"])'
          },
          groupName: {
            type: 'string',
            description: 'Name for the group (e.g., "navigation bar")'
          }
        },
        required: ['objectIdentifiers']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteShape',
      description: 'Delete a shape from the canvas',
      parameters: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Description of the shape to delete'
          }
        },
        required: ['identifier']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCanvasState',
      description: 'Get the current state of the canvas including all objects',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

// Type for AI command result
export interface AICommandResult {
  success: boolean;
  message: string;
  actions: Array<{
    type: string;
    data: any;
  }>;
  suggestions?: string[];
}

// Store conversation history for context
let conversationHistory: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

// Generate smart suggestions based on what was just created
function generateSuggestions(actions: any[], canvasObjects: CanvasObject[]): string[] {
  const suggestions: string[] = [];
  
  // Analyze what was created
  const hasShapes = actions.some(a => a.type === 'createShape');
  const hasText = actions.some(a => a.type === 'createText');
  const hasComplex = actions.some(a => a.type === 'createComplex');
  const actionCount = actions.length;
  
  // Generate contextual suggestions
  if (hasComplex) {
    const complexType = actions.find(a => a.type === 'createComplex')?.data.type;
    if (complexType === 'card') {
      suggestions.push('Try rotating the card 15 degrees for a dynamic look');
      suggestions.push('Add a button below the description');
      suggestions.push('Create 3 cards in a row for a gallery layout');
    } else if (complexType === 'nav-bar') {
      suggestions.push('Add a logo circle to the left of the navigation');
      suggestions.push('Create a button on the right side');
      suggestions.push('Change the navigation bar color to match your brand');
    } else if (complexType === 'login-form') {
      suggestions.push('Add a "Forgot Password" text below the button');
      suggestions.push('Create a registration form next to it');
      suggestions.push('Add a logo or icon above the title');
    }
  } else if (hasShapes && actionCount === 1) {
    suggestions.push('Add another shape next to it');
    suggestions.push('Create text to label this shape');
    suggestions.push('Make it twice as big');
    suggestions.push('Add a few more shapes to create a pattern');
  } else if (hasShapes && actionCount > 1) {
    suggestions.push('Arrange these shapes in a grid');
    suggestions.push('Group them together');
    suggestions.push('Add text labels for each shape');
  } else if (hasText) {
    suggestions.push('Add a rectangle background behind the text');
    suggestions.push('Create a matching text element below');
    suggestions.push('Change the font size to 32 for emphasis');
  }
  
  // General suggestions if nothing specific
  if (suggestions.length === 0) {
    suggestions.push('Create more shapes to build your design');
    suggestions.push('Try adding text to label your elements');
    suggestions.push('Arrange your objects in a layout');
  }
  
  // Limit to 4 suggestions max
  return suggestions.slice(0, 4);
}

// Process AI command
export async function processAICommand(
  userMessage: string,
  canvasObjects: CanvasObject[]
): Promise<AICommandResult> {
  try {
    // Get info about all objects for context - include type, color, sides (for polygons), and other identifying features
    const allObjectsInfo = canvasObjects.map(obj => {
      const objInfo: any = {
        type: obj.type,
        color: obj.fill,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height
      };
      
      // Add type-specific properties for better identification
      if (obj.type === 'polygon' && obj.sides) {
        objInfo.sides = obj.sides;
        objInfo.shapeDescription = `${obj.sides}-sided polygon`;
      }
      if (obj.type === 'ellipse') {
        objInfo.shapeDescription = 'ellipse';
      }
      if (obj.nickname) {
        objInfo.nickname = obj.nickname;
      }
      if (obj.text) {
        objInfo.text = obj.text;
      }
      
      return objInfo;
    });
    
    // Recent objects for quick reference
    const recentObjects = allObjectsInfo.slice(-5);

    // Build system message with current context
    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: 'system',
      content: `You are an AI assistant that helps users create and manipulate objects on a collaborative canvas.

COORDINATE SYSTEM (IMPORTANT):
- Origin (0, 0) is at the CENTER of the screen
- Positive X goes RIGHT (range: -500 to 500)
- Positive Y goes UP (range: -300 to 300) - THIS IS INVERTED FROM SCREEN COORDINATES
- In the internal system, positive Y is DOWN, but users see it as UP
- When user says Y=200, you must use Y=-200 in the function call
- When user says Y=-100, you must use Y=100 in the function call
- ALWAYS INVERT THE Y COORDINATE: user_y_value * -1

POSITIONING RULES:
- When user says "next to" or "beside", add 150-200 to X coordinate
- When user says "below" or "under" (for positioning), ADD 60-80 to Y coordinate (in canvas coords, which moves it DOWN visually)
- When user says "above", SUBTRACT 60-80 from Y coordinate (in canvas coords, which moves it UP visually)
- "directly under X" = same X coordinate, Y + 60-80
- When user says "under the login button", find "Login Button" position and add 70 to Y

BUTTON CREATION:
- "add a button" or "create a button" → use createButton (NOT createShape + createText separately)
- "add a sign up button" → createButton with text: "Sign Up"
- Buttons automatically get shadow, rounded corners, and proper text styling

TEXT MODIFICATION RULES:
- "change the font size" → use modifyText (NOT createText)
- "make the text bigger" → use modifyText with fontSize
- "change it to red" (for text) → use modifyText with color
- "change the text to X" → use modifyText with text property
- ONLY use createText for NEW text, use modifyText for EXISTING text
- When user says "the text" or references recently created text, use modifyText

LAYERING (Z-INDEX) RULES - CRITICAL:
- "in front of" or "on top of" = ALWAYS use changeLayer with action: "front" (NOT moveShape)
- "behind" (without "to the" or position words) = ALWAYS use changeLayer with action: "back" (NOT moveShape)
- "bring forward" = ALWAYS use changeLayer with action: "forward"
- "send backward" = ALWAYS use changeLayer with action: "backward"
- CREATION + LAYERING:
  * "make a circle in front of X" = createShape(circle) + changeLayer(circle, "front") - TWO calls!
  * "create a square behind Y" = createShape(square) + changeLayer(square, "back") - TWO calls!
  * Don't skip the creation step! User said "make" or "create" = they want a NEW object
- SPATIAL vs LAYERING:
  * "behind the circle" = changeLayer (layering) ✅
  * "to the left of the circle" = moveShape (spatial) ✅
  * "under the circle" (visually overlapped) = changeLayer (layering) ✅
  * "below the circle" (positioned lower) = moveShape (spatial) ✅
- CRITICAL: When user says "put X behind Y" or "put X in front of Y", this is ALWAYS about layering, NOT position!
- NEVER respond with text like "already in front". ALWAYS execute the changeLayer function.
- Users cannot see z-index values - they see visual stacking. Trust their command.
- Do NOT check z-index or make any assumptions. Just execute the command.

COLOR CODES (use exact hex):
- red: #FF0000
- blue: #0000FF  
- green: #00FF00
- yellow: #FFFF00
- purple: #800080
- orange: #FFA500
- black: #000000
- white: #FFFFFF
- gray: #808080
- pink: #FFC0CB

DEFAULT SIZES:
- Small shapes: 80x80
- Medium shapes (default): 120x120
- Large shapes: 200x200
- Text: fontSize 24, width 200

CURRENT CANVAS STATE (REAL-TIME):
- Total objects: ${canvasObjects.length}
- Recent objects: ${JSON.stringify(recentObjects)}
- All objects: ${JSON.stringify(allObjectsInfo)}
- DO NOT analyze or check layer order - just execute layer commands when requested

OBJECT STRUCTURE UNDERSTANDING:
- Each object has: type (rectangle, circle, polygon, ellipse, line, text, image, group), color (fill), position (x, y), size (width, height)
- Polygons have: sides (number of sides), shapeDescription (e.g., "3-sided polygon" = triangle, "4-sided polygon" = square/rectangle, "5-sided polygon" = pentagon)
- Ellipses have: shapeDescription = "ellipse"
- Circles: type = "circle", width = diameter
- Rectangles: type = "rectangle", can be squares if width === height
- When user says "circles", filter by type: "circle"
- When user says "squares", filter by type: "rectangle" AND width === height
- When user says "triangles", filter by type: "polygon" AND sides === 3
- When user says "polygons", filter by type: "polygon"
- When arranging by color: use filterColor parameter with hex code or color name

TRIANGLE & POLYGON CREATION:
- "create a triangle" or "make a triangle" → use createPolygon with sides: 3
- "draw a red triangle" → createPolygon(sides: 3, color: "#FF0000", x: 0, y: 0, sideLength: 120)
- "make a pentagon" → createPolygon(sides: 5, ...)
- "create a hexagon" → createPolygon(sides: 6, ...)
- Triangles are 3-sided polygons - use createPolygon, NOT createShape
- Default sideLength for triangles: 120 pixels
- For other polygons, sideLength: 100 is a good default

IMPORTANT RULES:
1. For basic commands like "make a red circle" or "draw a circle", create it at origin (0, 0) with default size (120x120)
2. For triangles: use createPolygon with sides: 3
3. For relative positioning ("next to it", "beside the last one"), use the LAST object's position and add appropriate offset
4. Always use proper hex color codes
5. Circles use width as diameter (height is ignored)
6. When creating multiple objects in one command, space them 150-200 pixels apart
7. For UI elements (login forms, nav bars, cards), use createComplex
6c. **CUSTOM SHAPES - USE TEMPLATES FIRST**:
   - For these shapes, use createCustomShape: cloud, sun, star, castle, smiley, fish
   - "draw a sun" → createCustomShape with shapeName: "sun"
   - "make a cloud" → createCustomShape with shapeName: "cloud"
   - "create a star" → createCustomShape with shapeName: "star"
   - "build a castle" → createCustomShape with shapeName: "castle"
   - "draw a smiley face" → createCustomShape with shapeName: "smiley"
   - "make a fish" → createCustomShape with shapeName: "fish"
6c2. **CUSTOM SHAPES - FLEXIBLE APPROACH**:
   - For ANY other complex shape, break it down into basic shapes (circles, rectangles, polygons, lines)
   - You can create ANY shape by combining basics, then use createGroup to group them
   - Examples of how to think:
     * Cloud → 3-5 white circles overlapping
     * Sun → 1 yellow circle + 8-12 yellow rectangles (rays) rotated around it
     * Star → Use polygon with custom vertices OR createCustomShape
     * Smiley → Yellow circle (face) + 2 small black circles (eyes) + curved line (smile)
     * Castle → Rectangles for towers, body, door + small rectangles for windows
     * Tree → Brown rectangle (trunk) + green circle or polygon (leaves)
     * House → Rectangle (body) + createPolygon(sides: 3) for roof triangle + rectangle (door) + small rectangles (windows)
     * Flower → Circle (center) + 5-8 circles or ellipses around it (petals)
     * Car → Rectangles (body) + 2 circles (wheels) + rectangles (windows)
   - IMPORTANT: For any new shape, think creatively and combine basics!
   - Use createCustomShape ONLY for: cloud, sun, star, castle, smiley, fish (pre-built templates)
   - For triangles: use createPolygon(sides: 3) - DO NOT use createCustomShape
   - For other polygons: use createPolygon with appropriate number of sides
   - For everything else: use createShape, createPolygon, createLine, createText multiple times, then createGroup
   - After creating multiple parts, ALWAYS group them with a descriptive name
6d. **CURVED LINES**:
   - Use createLine with curved: true for smiles, arcs, waves
   - curvature parameter controls bend: positive = up, negative = down
   - Smiley face smile uses curved line with curvature
6b. **MULTIPLE OBJECTS WITH SPACING**:
   - "draw seven blue rectangles equally spaced" → create 7 rectangles, then arrangeShapes(horizontal)
   - "create a 3x3 grid of squares" → create 9 squares, then arrangeShapes(grid, spacing: 150)
   - "make a grid of X objects" → create X objects, then arrangeShapes(grid)
   - "create X objects" where X > 1 → create multiple createShape calls, then use arrangeShapes
   - "approximately equal distances apart" → use arrangeShapes with spacing: 200
   - ALWAYS call arrangeShapes after creating multiple objects to space them
   - For grids, use arrangement: "grid" and it will auto-calculate grid dimensions
6b2. **ARRANGING EXISTING SHAPES - CRITICAL**:
   - "arrange all the circles in a horizontal line" → arrangeShapes(horizontal, filterType: "circle")
   - "arrange the squares vertically" → arrangeShapes(vertical, filterType: "square")
   - "arrange all red shapes in a grid" → arrangeShapes(grid, filterColor: "#FF0000")
   - "arrange the blue circles horizontally" → arrangeShapes(horizontal, filterType: "circle", filterColor: "#0000FF")
   - "arrange all triangles" → arrangeShapes(horizontal, filterType: "triangle")
   - "arrange the polygons" → arrangeShapes(horizontal, filterType: "polygon")
   - CRITICAL: When user specifies a shape type (circles, squares, triangles, etc.), ALWAYS use filterType parameter!
   - If user says "arrange all circles", use filterType: "circle" - this ensures ONLY circles are arranged, not other shapes
   - If user says "arrange the shapes" without specifying type, don't use filterType (arranges all shapes)
7. **Y-AXIS EXAMPLES**: 
   - User says "move to 200, 200" (top right) → use x: 200, y: -200
   - User says "move to 200, -200" (bottom right) → use x: 200, y: 200
   - User says "create at 0, 100" (above center) → use x: 0, y: -100
   - User says "create at 0, -100" (below center) → use x: 0, y: 100
7b. **LAYERING EXAMPLES - CRITICAL**:
   - "make a yellow circle in front of the square":
     * Find square's position (x, y)
     * createShape(circle, yellow, x: square.x, y: square.y) - CREATE AT SAME POSITION!
     * changeLayer(circle, "front") - THEN LAYER
     * TWO CALLS! Circle appears at same spot as square, layered on top
   - "create a red square behind the circle":
     * Find circle's position
     * createShape(square, red, x: circle.x, y: circle.y) - SAME POSITION!
     * changeLayer(square, "back") - THEN LAYER
   - "put the circle in front of the square" → changeLayer(circle, "front") if circle exists (ONE CALL)
   - CRITICAL: "in front of" or "behind" means SAME POSITION, different Z-INDEX
     * Find the reference object's position
     * Create new object AT THAT POSITION (not at origin!)
     * Then change layer
     * "in front/behind" is ALWAYS about z-axis, not spatial positioning!
8. **RELATIVE SIZING**: 
   - "make X bigger by Y" → look at recent objects to find X's current size, add Y
   - "make X smaller by Y" → find at current size, subtract Y
   - "make X twice as big" → find current size, multiply by 2
   - For circles: width and height should be the same (diameter)
9. **GROUPING**:
   - "group [objects]" or "group the navigation items" → use createGroup
   - Identify objects by their nicknames if they have them (e.g., "Nav Item 1", "Nav Item 2", "Nav Bar")
   - For createComplex nav-bar, objects are named: "Nav Bar" (background), "Nav Item 1", "Nav Item 2", etc.
   - groupName should be descriptive (e.g., "navigation bar", "login form group")
10. **SCALING**:
   - MAXIMUM 100 objects per query (hard limit)
   - For large grids: "create a 10x10 grid" → max 100 objects
   - If user asks for more than 100, respond with message suggesting smaller batch
   - User will see a preview for operations creating 3+ objects
11. **CREATIVE PROBLEM SOLVING**:
   - When user asks for a shape you haven't seen before, THINK IT THROUGH:
     * What basic shapes would form this?
     * What colors make sense?
     * What relative positions?
   - Examples:
     * "Robot" → Rectangle (body) + rectangle (head) + 4 small rectangles (limbs) + circles (eyes)
     * "Rocket" → createPolygon(sides: 3) for top triangle + rectangle (body) + 2 createPolygon(sides: 3) for fins
     * "Ice cream cone" → createPolygon(sides: 3) for cone triangle + circle or multiple circles (scoops)
     * "Umbrella" → Curved line (canopy arc) + straight line (handle)
     * "Heart" → 2 circles (top bumps) + createPolygon(sides: 3) for bottom point OR use multiple circles
   - BE CREATIVE and use your reasoning to decompose any shape into basics!
   - Remember: Triangles = createPolygon(sides: 3), NOT createShape or createCustomShape!`
    };

    // Add to conversation history
    if (conversationHistory.length === 0 || conversationHistory[0].role !== 'system') {
      conversationHistory = [systemMessage];
    } else {
      conversationHistory[0] = systemMessage; // Update system message with latest state
    }

    // Add user message
    conversationHistory.push({
      role: 'user',
      content: userMessage
    });

    // Keep only last exchanges to avoid token limits
    // Keep system message + last 4 complete exchanges (user + assistant + tools)
    if (conversationHistory.length > 20) {
      // Find the last complete exchange boundary
      const systemMsg = conversationHistory[0];
      let recentMessages = conversationHistory.slice(-15);
      
      // Make sure we don't break tool message pairs
      // Remove any orphaned tool messages at the start
      while (recentMessages.length > 0 && recentMessages[0].role === 'tool') {
        recentMessages = recentMessages.slice(1);
      }
      
      conversationHistory = [systemMsg, ...recentMessages];
    }

    // Check if API key is available
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured. Please set REACT_APP_OPENAI_API_KEY in your .env.local file and restart the development server.');
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: conversationHistory,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 2048 // Limit to 100 objects max (enough for most operations)
    });

    const result: AICommandResult = {
      success: false,
      message: '',
      actions: []
    };

    const choice = response.choices[0];
    
    // Add assistant response to conversation history
    conversationHistory.push(choice.message);
    
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      // Process each tool call and add tool responses
      for (const toolCall of choice.message.tool_calls) {
        // Type guard to ensure it's a function call
        if (toolCall.type === 'function' && toolCall.function) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          
          result.actions.push({
            type: functionName,
            data: args
          });

          // Add tool response message to conversation history
          conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: true, function: functionName, args })
          });
        }
      }
      
      // Enforce 100 object limit
      if (result.actions.length > 100) {
        result.success = false;
        result.message = `Too many objects requested (${result.actions.length}). Maximum is 100 objects per command. Try splitting into smaller batches.`;
        result.actions = [];
      } else {
        result.success = result.actions.length > 0;
        result.message = result.actions.length === 1 
          ? `Executed ${result.actions[0].type}`
          : `Executed ${result.actions.length} actions successfully`;
        
        // Generate suggestions if actions were successful
        if (result.success) {
          result.suggestions = generateSuggestions(result.actions, canvasObjects);
        }
      }
    } else if (choice.message.content) {
      result.message = choice.message.content;
    } else {
      result.message = 'I couldn\'t process that command. Try being more specific.';
    }

    return result;
  } catch (error) {
    console.error('AI Service Error:', error);
    
    // Check for specific API key errors
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('401') || error.message.includes('Unauthorized')) {
        return {
          success: false,
          message: 'Invalid or missing OpenAI API key. Please check your .env.local file and restart the development server.',
          actions: []
        };
      }
      
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        return {
          success: false,
          message: 'OpenAI API rate limit exceeded. Please try again in a moment.',
          actions: []
        };
      }
      
      if (error.message.includes('insufficient_quota') || error.message.includes('billing')) {
        return {
          success: false,
          message: 'OpenAI API quota exceeded. Please check your OpenAI account billing.',
          actions: []
        };
      }
    }
    
    // If there's an error with the conversation history, reset it
    if (error instanceof Error && error.message.includes('tool')) {
      console.log('Resetting conversation history due to tool message error');
      conversationHistory = [];
    }
    
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An error occurred processing your command. Please check your API key and try again.',
      actions: []
    };
  }
}

// Export function to reset conversation history manually
export function resetConversationHistory() {
  conversationHistory = [];
}

// Process AI command with image
export async function processAICommandWithImage(
  userMessage: string,
  imageBase64: string,
  canvasObjects: CanvasObject[]
): Promise<AICommandResult> {
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an AI assistant that analyzes UI designs and recreates them on a canvas using shapes.

TASK: Analyze the provided image and recreate its design using canvas shapes (rectangles, circles, text).

COORDINATE SYSTEM:
- Origin (0, 0) is at the CENTER of the screen
- Positive X goes RIGHT, negative X goes LEFT
- Positive Y goes DOWN (but display shows inverted for user)
- For images, estimate positions relative to center

ANALYSIS INSTRUCTIONS:
1. Identify all UI elements in the image (buttons, text, shapes, containers)
2. For each element, determine:
   - Type (rectangle for boxes/buttons, circle for round elements, text for labels)
   - Approximate position (estimate X, Y coordinates)
   - Approximate size (width, height in pixels)
   - Color (use hex codes or closest match)
3. Create elements in order from back to front (background first)
4. Use createComplex for common patterns (login forms, nav bars, cards)
5. Group related elements together after creation

IMPORTANT:
- Be precise with positioning to match the layout
- Use appropriate colors that match the image
- Create text elements for all readable text in the image
- Maintain relative spacing and alignment
- Create multiple shapes to represent complex elements`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userMessage
          },
          {
            type: 'image_url',
            image_url: {
              url: imageBase64,
              detail: 'high'
            }
          }
        ]
      }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo', // Use gpt-4-turbo for vision
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 2048 // Limit to 100 objects max
    });

    const result: AICommandResult = {
      success: false,
      message: '',
      actions: []
    };

    const choice = response.choices[0];
    
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      // Process each tool call
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function' && toolCall.function) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          
          result.actions.push({
            type: functionName,
            data: args
          });
        }
      }
      
      // Enforce 100 object limit
      if (result.actions.length > 100) {
        result.success = false;
        result.message = `Too many objects requested (${result.actions.length}). Maximum is 100 objects per command. Try a simpler design or split into batches.`;
        result.actions = [];
      } else {
        result.success = result.actions.length > 0;
        result.message = `Analyzed image and created ${result.actions.length} elements`;
      }
    } else if (choice.message.content) {
      result.message = choice.message.content;
    } else {
      result.message = 'I couldn\'t analyze that image. Try a clearer screenshot.';
    }

    return result;
  } catch (error) {
    console.error('AI Vision Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An error occurred analyzing the image',
      actions: []
    };
  }
}

