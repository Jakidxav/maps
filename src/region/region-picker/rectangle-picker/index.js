import { useState, useEffect } from 'react'
import { useMap } from '../../../map-provider'
import RectangleRenderer from './rectangle-renderer'

import { HANDLE_RADIUS } from './rectangle-renderer';

const RectanglePicker = ({
  id,
  backgroundColor,
  center,
  color,
  fontFamily,
  fontSize,
  radius,
  onIdle,
  onDrag,
  units,
  maxRadius,
  minRadius,
}) => {
  const { map } = useMap()
  const [renderer, setRenderer] = useState(null)

  useEffect(() => {
    const renderer = RectangleRenderer({
      id,
      map,
      onIdle,
      onDrag,
      initialCenter: center,
      initialRadius: radius,
      units,
      maxRadius,
      minRadius,
    })

    setRenderer(renderer)

    return function cleanup() {
      // need to check load state for fast-refresh purposes
      if (map.loaded()) renderer.remove()
    }
  }, [])

  return (
    <svg
      id={`rectangle-picker-${id}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
      }}
    >
      <defs>
        <clipPath id={`rect-clip-${id}`}>
          <path id={`rectangle-cutout-${id}`} />
        </clipPath>
      </defs>

      <path
        id={`rectangle-${id}`}
        stroke={color}
        strokeWidth={1}
        fill='transparent'
        cursor='move'
      />

      <rect
        x='0'
        y='0'
        width='100%'
        height='100%'
        clipPath={`url(#rect-clip-${id})`}
        fill={backgroundColor}
        fillOpacity={0.5}
      />

      <circle id={`handle-${id}`} r={HANDLE_RADIUS} fill={color} cursor='ew-resize' />
      
      <line
        id={`radius-guideline-${id}`}
        stroke={color}
        strokeOpacity={0}
        strokeWidth={1}
        strokeDasharray='3,2'
      />

      <g id={`radius-text-container-${id}`}>
        <text
          id={`radius-text-${id}`}
          textAnchor='middle'
          fontFamily={fontFamily}
          fontSize={fontSize}
          fill={color}
        />
      </g>
    </svg>
  )
}

export default RectanglePicker