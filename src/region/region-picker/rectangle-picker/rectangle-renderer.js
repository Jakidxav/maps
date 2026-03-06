import { select } from 'd3-selection'
import { getPathMaker, project } from '../utils'
import {
  area,
  bbox,
  bboxPolygon,
  convertArea,
  distance,
  rewind,
  rhumbDestination,
  lineString,
  lineIntersect,
  circle as turfCircle,
  point,
} from '@turf/turf'
import CursorManager from '../cursor-manager'

export const HANDLE_RADIUS = 8
export const SHOW_RADIUS_GUIDELINE = true

const POLES = [point([0, -90]), point([0, 90])]
const abbreviations = {
  kilometers: 'km',
  miles: 'mi',
}

export default function RectangleRenderer({
  id,
  map,
  onIdle = (rectangle) => {},
  onDrag = (rectangle) => {},
  initialCenter = { lat: 0, lng: 0 },
  initialRadius = 0,
  maxRadius,
  minRadius,
  units,
}) {
  let circle = null
  let rectangle = null
  let center = initialCenter
  let centerXY = project(map, center)
  let radius = initialRadius

  const svg = select(`#rectangle-picker-${id}`).style('pointer-events', 'none')
  const svgHandle = select(`#handle-${id}`).style('pointer-events', 'all')
  const svgGuideline = select(`#radius-guideline-${id}`)
  const svgRadiusTextContainer = select(`#radius-text-container-${id}`)
  const svgRadiusText = select(`#radius-text-${id}`).attr('fill-opacity', 0)
  const svgRectangle = select(`#rectangle-${id}`).style('pointer-events', 'all')
  const svgRectCutout = select(`#rectangle-cutout-${id}`)

  let guidelineAngle = 135
  if (!SHOW_RADIUS_GUIDELINE) {
    svgGuideline.style('display', 'none')
    svgRadiusTextContainer.style('display', 'none')
  }

  const removers = []

  //// LISTENERS ////

  function addDragHandleListeners() {
    const onMouseMove = (e) => {
      let r = distance(
        map.unproject(e.point).toArray(),
        [center.lng, center.lat],
        { units }
      )
      r = maxRadius ? Math.min(r, maxRadius) : r
      r = minRadius ? Math.max(r, minRadius) : r
      setRadius(r)
      onDrag(rectangle)
    }

    const onMouseUp = () => {
      onIdle(rectangle)
      setCursor({ draggingHandle: false })
      map.off('mousemove', onMouseMove)
      map.off('touchmove', onMouseMove)
      svgHandle.style('pointer-events', 'all')
      svgRectangle.style('pointer-events', 'all')
      svgRadiusText.attr('fill-opacity', 0)
      svgGuideline.attr('stroke-opacity', 0)
    }

    const handleStart = (e) => {
      if (e.type === 'touchstart') {
        map.dragPan.disable()
        map.on('touchmove', onMouseMove)
        map.once('touchend', onMouseUp)
      } else {
        map.on('mousemove', onMouseMove)
        map.once('mouseup', onMouseUp)
      }
      setCursor({ draggingHandle: true })
      svgHandle.style('pointer-events', 'none')
      svgRectangle.style('pointer-events', 'none')
      svgRadiusText.attr('fill-opacity', 1)
      svgGuideline.attr('stroke-opacity', 1)
    }

    svgHandle.on('mousedown', handleStart)
    svgHandle.on('touchstart', handleStart)

    removers.push(function removeDragHandleListeners() {
      svgHandle.on('mousedown', null)
      svgHandle.on('touchstart', null)
    })
  }

  function addRectangleListeners() {
    let offset
    const mapCanvas = map.getCanvas()

    const onMouseMove = (e) => {
      setCenter(
        {
          lng: e.lngLat.lng - offset.lng,
          lat: e.lngLat.lat - offset.lat,
        },
        {
          x: e.point.x,
          y: e.point.y,
        }
      )
      onDrag(rectangle)
    }

    const onMouseUp = () => {
      onIdle(rectangle)
      setCursor({ draggingRegion: false })
      map.off('mousemove', onMouseMove)
      map.off('touchmove', onMouseMove)
      map.dragPan.enable()
      svgRectangle.style('pointer-events', 'all')
      svgHandle.style('pointer-events', 'all')
      svgRectangle.attr('stroke-width', 1)
    }

    const handleRectangleStart = (e) => {
      let point
      if (e.type === 'touchstart') {
        const touch = e.touches[0]
        point = { x: touch.pageX, y: touch.pageY }
        svgRectangle.attr('stroke-width', 4)
        map.dragPan.disable()
        map.on('touchmove', onMouseMove)
        map.once('touchend', onMouseUp)
      } else {
        point = { x: e.offsetX, y: e.offsetY }
        map.on('mousemove', onMouseMove)
        map.once('mouseup', onMouseUp)
      }
      const lngLat = map.unproject(point)
      offset = {
        lng: lngLat.lng - center.lng,
        lat: lngLat.lat - center.lat,
      }
      setCursor({ draggingRegion: true })
      svgRectangle.style('pointer-events', 'none')
      svgHandle.style('pointer-events', 'none')
    }

    svgRectangle.on('mousedown', handleRectangleStart)
    svgRectangle.on('touchstart', handleRectangleStart)

    svgRectangle.on('wheel', (e) => {
      e.preventDefault()
      let newEvent = new e.constructor(e.type, e)
      mapCanvas.dispatchEvent(newEvent)
    })

    removers.push(function removeRectangleListeners() {
      svgRectangle.on('mousedown', null)
      svgRectangle.on('touchstart', null)
      svgRectangle.on('wheel', null)
    })
  }

  function addMapMoveListeners() {
    const onMove = setRectangle

    map.on('move', onMove)
    removers.push(function removeMapMoveListeners() {
      map.off('move', onMove)
    })
  }

  //// RECTANGLE ////

  function geoCircle(center, radius, inverted = false) {
    const c = turfCircle([center.lng, center.lat], radius, {
      units,
      steps: 64,
      properties: {
        center,
        radius,
        units,
      },
    })

    c.properties.area = convertArea(area(c), 'meters', units)
    c.properties.zoom = map.getZoom()

    if (inverted) {
      return c
    }

    // need to rewind or svg fill is inside-out
    return rewind(c, { reverse: true, mutate: true })
  }

  function geoRect(c, inverted = false) {
    let _bbox = bbox(c)
    let r = bboxPolygon(_bbox)

    const corners = [
      [_bbox[0], _bbox[3]], // upper‑left  (west, north)
      [_bbox[2], _bbox[3]], // upper‑right (east, north)
      [_bbox[2], _bbox[1]], // lower‑right (east, south)
      [_bbox[0], _bbox[1]], // lower‑left  (west, south)
    ]

    // console.log('Corner coordinate pairs:', corners);
    r.properties.center = c?.properties?.center
    r.properties.corners = corners
    r.properties.zoom = map.getZoom()
    r.properties.radius = c?.properties?.radius * Math.sqrt(2)
    r.properties.radiusUnits = c?.properties?.units
    r.properties.area = convertArea(area(r), 'meters', units)

    if (inverted) {
      return r
    }

    // need to rewind or svg fill is inside-out
    return rewind(r, { reverse: true, mutate: true })
  }

  //// SETTERS ////

  const setCursor = CursorManager(map)

  function setCenter(_center, _point) {
    if (_center && _center !== center) {
      if (nearPoles(_center, radius)) {
        center = { lng: _center.lng, lat: center.lat }
        centerXY = { x: _point.x, y: centerXY.y }
      } else {
        center = _center
        centerXY = _point
      }

      setRectangle()
    }
  }

  function resetCenterXY() {
    // reset centerXY value based on latest `map` value
    centerXY = project(map, center, { referencePoint: centerXY })
  }

  function setRadius(_radius) {
    if (_radius && _radius !== radius) {
      if (!nearPoles(center, _radius)) {
        radius = _radius
        setRectangle()
      }
    }
  }

  function nearPoles(center, radius) {
    const turfPoint = point([center.lng, center.lat])

    return POLES.some((pole) => distance(turfPoint, pole, { units }) < radius)
  }

  function setRectangle() {
    // ensure that centerXY is up-to-date with map
    resetCenterXY()

    const makePath = getPathMaker(map, {
      referencePoint: centerXY,
    })

    // update svg circle, then rectangle
    circle = geoCircle(center, radius / Math.sqrt(2))
    rectangle = geoRect(circle)
    let path = makePath(rectangle)

    svgRectangle.attr('d', path)

    const cutoutRect = geoRect(circle, true)
    const cutoutRectPath = makePath(cutoutRect)
    const { width, height } = svg.node().getBBox()
    svgRectCutout.attr('d', cutoutRectPath + ` M0,0H${width}V${height}H0V0z`)

    // update other svg elements
    const handleXY = (() => {
      // by default just render handle based on radius and guideline angle
      let coordinates = rhumbDestination(
        [center.lng, center.lat],
        radius * Math.sqrt(2),
        guidelineAngle
      ).geometry.coordinates
      // let coordinates = point(rectangle.properties.corners[2])

      // lower-right corner of rectangle, where handle is
      const lineEnd = point(rectangle.properties.corners[2])

      const line = lineString([
        [center.lng, center.lat],
        lineEnd.geometry.coordinates,
      ])

      const inter = lineIntersect(line, rectangle)
      // prefer rendering using intersection with rectangle to handle distortions near poles
      if (inter.features.length > 0) {
        coordinates = inter.features[0].geometry.coordinates
      }

      return project(map, coordinates, {
        referencePoint: centerXY,
      })
    })()

    svgHandle.attr('cx', handleXY.x).attr('cy', handleXY.y)

    svgGuideline
      .attr('x1', centerXY.x)
      .attr('y1', centerXY.y)
      .attr('x2', handleXY.x)
      .attr('y2', handleXY.y)

    const translateY = 4

    svgRadiusText
      .text(radius.toFixed(0) + abbreviations[units])
      .attr(
        'transform',
        `rotate(${-1 * guidelineAngle + 90}) ` + `translate(0, ${translateY})`
      )

    const translateX = (() => {
      const { width: textWidth } = svgRadiusText.node().getBBox()
      const coeff = 0.8 * Math.sin((guidelineAngle * Math.PI) / 180)
      return 18 + Math.abs((coeff * textWidth) / 2)
    })()

    svgRadiusTextContainer.attr(
      'transform',
      `rotate(${guidelineAngle - 90}, ${handleXY.x}, ${handleXY.y}) ` +
        `translate(${handleXY.x + translateX}, ${handleXY.y})`
    )
  }

  //// INIT ////

  addDragHandleListeners()
  addRectangleListeners()
  addMapMoveListeners()
  setRectangle()
  onIdle(rectangle)

  //// INTERFACE ////

  return {
    remove: () => {
      removers.reverse().forEach((remove) => remove())
      onIdle(null)
    },
  }
}
