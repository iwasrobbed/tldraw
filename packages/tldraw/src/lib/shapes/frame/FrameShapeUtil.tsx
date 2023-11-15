import {
	BaseBoxShapeUtil,
	Geometry2d,
	Rectangle2d,
	SVGContainer,
	SelectionEdge,
	TLFrameShape,
	TLGroupShape,
	TLOnResizeEndHandler,
	TLShape,
	TLShapeId,
	canonicalizeRotation,
	frameShapeMigrations,
	frameShapeProps,
	getDefaultColorTheme,
	last,
	toDomPrecision,
} from '@tldraw/editor'
import { useDefaultColorTheme } from '../shared/ShapeFill'
import { createTextSvgElementFromSpans } from '../shared/createTextSvgElementFromSpans'
import { FrameHeading } from './components/FrameHeading'

export function defaultEmptyAs(str: string, dflt: string) {
	if (str.match(/^\s*$/)) {
		return dflt
	}
	return str
}

/** @public */
export class FrameShapeUtil extends BaseBoxShapeUtil<TLFrameShape> {
	static override type = 'frame' as const
	static override props = frameShapeProps
	static override migrations = frameShapeMigrations

	override canBind = () => true

	override canEdit = () => true

	override getDefaultProps(): TLFrameShape['props'] {
		return { w: 160 * 2, h: 90 * 2, name: '' }
	}

	override getGeometry(shape: TLFrameShape): Geometry2d {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: false,
		})
	}

	override component(shape: TLFrameShape) {
		const bounds = this.editor.getShapeGeometry(shape).bounds
		// eslint-disable-next-line react-hooks/rules-of-hooks
		const theme = useDefaultColorTheme()

		return (
			<>
				<SVGContainer>
					<rect
						className="tl-frame__body"
						width={bounds.width}
						height={bounds.height}
						fill={theme.solid}
						stroke={theme.text}
					/>
				</SVGContainer>
				<FrameHeading
					id={shape.id}
					name={shape.props.name}
					width={bounds.width}
					height={bounds.height}
				/>
			</>
		)
	}

	override toSvg(shape: TLFrameShape): SVGElement | Promise<SVGElement> {
		const theme = getDefaultColorTheme({ isDarkMode: this.editor.user.isDarkMode })
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')

		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
		rect.setAttribute('width', shape.props.w.toString())
		rect.setAttribute('height', shape.props.h.toString())
		rect.setAttribute('fill', theme.solid)
		rect.setAttribute('stroke', theme.black.solid)
		rect.setAttribute('stroke-width', '1')
		rect.setAttribute('rx', '1')
		rect.setAttribute('ry', '1')
		g.appendChild(rect)

		// Text label
		const pageRotation = canonicalizeRotation(
			this.editor.getShapePageTransform(shape.id)!.rotation()
		)
		// rotate right 45 deg
		const offsetRotation = pageRotation + Math.PI / 4
		const scaledRotation = (offsetRotation * (2 / Math.PI) + 4) % 4
		const labelSide: SelectionEdge = (['top', 'left', 'bottom', 'right'] as const)[
			Math.floor(scaledRotation)
		]

		let labelTranslate: string
		switch (labelSide) {
			case 'top':
				labelTranslate = ``
				break
			case 'right':
				labelTranslate = `translate(${toDomPrecision(shape.props.w)}px, 0px) rotate(90deg)`
				break
			case 'bottom':
				labelTranslate = `translate(${toDomPrecision(shape.props.w)}px, ${toDomPrecision(
					shape.props.h
				)}px) rotate(180deg)`
				break
			case 'left':
				labelTranslate = `translate(0px, ${toDomPrecision(shape.props.h)}px) rotate(270deg)`
				break
			default:
				labelTranslate = ``
		}

		// Truncate with ellipsis
		const opts = {
			fontSize: 12,
			fontFamily: 'Inter, sans-serif',
			textAlign: 'start' as const,
			width: shape.props.w,
			height: 32,
			padding: 0,
			lineHeight: 1,
			fontStyle: 'normal',
			fontWeight: 'normal',
			overflow: 'truncate-ellipsis' as const,
			verticalTextAlign: 'middle' as const,
		}

		const spans = this.editor.textMeasure.measureTextSpans(
			defaultEmptyAs(shape.props.name, 'Frame') + String.fromCharCode(8203),
			opts
		)

		const firstSpan = spans[0]
		const lastSpan = last(spans)!
		const labelTextWidth = lastSpan.box.w + lastSpan.box.x - firstSpan.box.x
		const text = createTextSvgElementFromSpans(this.editor, spans, {
			offsetY: -opts.height - 2,
			...opts,
		})
		text.style.setProperty('transform', labelTranslate)

		const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
		textBg.setAttribute('x', '-8px')
		textBg.setAttribute('y', -opts.height - 4 + 'px')
		textBg.setAttribute('width', labelTextWidth + 16 + 'px')
		textBg.setAttribute('height', `${opts.height}px`)
		textBg.setAttribute('rx', 4 + 'px')
		textBg.setAttribute('ry', 4 + 'px')
		textBg.setAttribute('fill', theme.background)

		g.appendChild(textBg)
		g.appendChild(text)

		return g
	}

	indicator(shape: TLFrameShape) {
		const bounds = this.editor.getShapeGeometry(shape).bounds

		return (
			<rect
				width={toDomPrecision(bounds.width)}
				height={toDomPrecision(bounds.height)}
				className={`tl-frame-indicator`}
			/>
		)
	}

	override canReceiveNewChildrenOfType = (shape: TLShape, _type: TLShape['type']) => {
		return !shape.isLocked
	}

	override providesBackgroundForChildren(): boolean {
		return true
	}

	override canDropShapes = (shape: TLFrameShape, _shapes: TLShape[]): boolean => {
		return !shape.isLocked
	}

	override onDragShapesOver = (frame: TLFrameShape, shapes: TLShape[]): { shouldHint: boolean } => {
		if (!shapes.every((child) => child.parentId === frame.id)) {
			this.editor.reparentShapes(
				shapes.map((shape) => shape.id),
				frame.id
			)
			return { shouldHint: true }
		}
		return { shouldHint: false }
	}

	override onDragShapesOut = (_shape: TLFrameShape, shapes: TLShape[]): void => {
		const parent = this.editor.getShape(_shape.parentId)
		const isInGroup = parent && this.editor.isShapeOfType<TLGroupShape>(parent, 'group')

		// If frame is in a group, keep the shape
		// moved out in that group

		if (isInGroup) {
			this.editor.reparentShapes(shapes, parent.id)
		} else {
			this.editor.reparentShapes(shapes, this.editor.currentPageId)
		}
	}

	canEnclose(shape: TLShape, ancestorIds: TLShapeId[], frame: TLShape): boolean {
		// We don't want to pull in shapes that are ancestors of the frame (can create a cycle)
		if (ancestorIds.includes(shape.id)) {
			return false
		}
		// We only want to pull in shapes that are siblings of the frame
		if (shape.parentId === frame.parentId) {
			return true
		}
		return false
	}

	override onResizeEnd: TLOnResizeEndHandler<TLFrameShape> = (shape) => {
		const bounds = this.editor.getShapePageBounds(shape)!
		const shapesToAddToFrame: TLShapeId[] = []
		const shapesToRemoveFromFrame: TLShapeId[] = []
		const ancestorIds = this.editor.getShapeAncestors(shape).map((shape) => shape.id)

		this.editor.currentPageShapes.map((pageShape) => {
			// We don't want to frame the frame itself
			if (pageShape.id === shape.id) return
			if (pageShape.isLocked) return

			const pageShapeBounds = this.editor.getShapePageBounds(pageShape)
			if (!pageShapeBounds) return

			// Frame shape encloses page shape
			if (bounds.includes(pageShapeBounds)) {
				if (this.canEnclose(pageShape, ancestorIds, shape)) {
					shapesToAddToFrame.push(pageShape.id)
				}
			} else {
				// We only want to remove shapes that are direct children of the frame
				if (pageShape.parentId === shape.id) {
					shapesToRemoveFromFrame.push(pageShape.id)
				}
			}
		})

		this.editor.batch(() => {
			this.editor.reparentShapes(shapesToAddToFrame, shape.id)
			this.editor.reparentShapes(shapesToRemoveFromFrame, this.editor.currentPageId)
		})
	}
}
