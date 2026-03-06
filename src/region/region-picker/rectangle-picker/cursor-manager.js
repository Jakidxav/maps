export default function CursorManager(map) {
  const canvas = map.getCanvas()
  const originalStyle = canvas.style.cursor

  let mouseState = {
    onHandle: false,
    draggingHandle: false,
    onRectangle: false,
    draggingRectangle: false,
  }

  return function setCursor(newState) {
    mouseState = {
      ...mouseState,
      ...newState,
    }

    if (mouseState.onHandle || mouseState.draggingHandle)
      canvas.style.cursor = 'ew-resize'
    else if (mouseState.onRectangle || mouseState.draggingRectangle)
      canvas.style.cursor = 'move'
    else canvas.style.cursor = originalStyle
  }
}
