export default function CursorManager(map) {
  const canvas = map.getCanvas()
  const originalStyle = canvas.style.cursor

  let mouseState = {
    onHandle: false,
    draggingHandle: false,
    onRegion: false,
    draggingRegion: false,
  }

  return function setCursor(newState) {
    mouseState = {
      ...mouseState,
      ...newState,
    }

    if (mouseState.onHandle || mouseState.draggingHandle)
      canvas.style.cursor = 'ew-resize'
    else if (mouseState.onRegion || mouseState.draggingRegion)
      canvas.style.cursor = 'move'
    else canvas.style.cursor = originalStyle
  }
}
