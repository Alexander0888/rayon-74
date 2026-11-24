import { useEffect, useRef, useState } from 'react';
import { waste } from '../../content/fr.js';
import { formatAxis, formatCurrency, longDay, shortDay } from './wasteFormat.js';

const lossColor = '#297862';
const averageColor = '#5366a1';
const layout = (width, height) => ({ x: width < 480 ? 45 : 59, y: 18, right: width - 14, bottom: height - 32 });

function segments(points, amount, x, y) {
  const result = [[]];
  points.forEach((point, i) => {
    const value = point[amount];
    if (value === null) {
      if (result.at(-1).length) result.push([]);
    } else result.at(-1).push([x(i), y(value)]);
  });
  return result.filter((segment) => segment.length);
}

function curve(context, segment) {
  context.moveTo(...segment[0]);
  for (let i = 1; i < segment.length; i += 1) {
    const [[previousX, previousY], [x, y]] = [segment[i - 1], segment[i]];
    const mid = (previousX + x) / 2;
    context.bezierCurveTo(mid, previousY, mid, y, x, y);
  }
}

function draw(canvas, points, width, height, selected) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  if (!context || !points.length) return;
  context.scale(ratio, ratio);
  const box = layout(width, height);
  const values = points.flatMap(({ amount, average }) => [amount, average]).filter((value) => value !== null);
  const top = Math.max(100, ...values);
  const low = Math.min(0, ...values);
  const widthOfPlot = box.right - box.x;
  const x = (i) => box.x + widthOfPlot * (points.length === 1 ? 0.5 : i / (points.length - 1));
  const y = (value) => box.bottom - (box.bottom - box.y) * (value - low) / (top - low);
  context.font = '11px system-ui, sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  context.fillStyle = '#596860';
  context.lineWidth = 1;
  context.strokeStyle = '#e5ece8';

  const tickCount = 4;
  for (let tick = 0; tick <= tickCount; tick += 1) {
    const value = low + (top - low) * tick / tickCount;
    const position = y(value);
    context.beginPath();
    context.moveTo(box.x, position);
    context.lineTo(box.right, position);
    context.stroke();
    context.fillText(formatAxis(value), box.x - 8, position);
  }

  const area = context.createLinearGradient(0, box.bottom, 0, box.y);
  area.addColorStop(0, 'rgba(69, 150, 118, .04)');
  area.addColorStop(0.53, 'rgba(91, 160, 122, .23)');
  area.addColorStop(1, 'rgba(218, 151, 103, .37)');
  const losses = segments(points, 'amount', x, y);
  context.fillStyle = area;
  for (const segment of losses) {
    context.beginPath();
    curve(context, segment);
    context.lineTo(segment.at(-1)[0], y(0));
    context.lineTo(segment[0][0], y(0));
    context.closePath();
    context.fill();
  }

  for (const [series, color, dash] of [
    [losses, lossColor, []], [segments(points, 'average', x, y), averageColor, [5, 5]],
  ]) {
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.setLineDash(dash);
    for (const segment of series) {
      context.beginPath();
      if (segment.length === 1) {
        context.arc(...segment[0], 3, 0, 2 * Math.PI);
        context.fill();
      } else {
        curve(context, segment);
        context.stroke();
      }
    }
  }
  context.setLineDash([]);

  const labels = Math.min(points.length, Math.max(2, Math.floor(width / 100)));
  context.fillStyle = '#596860';
  context.textBaseline = 'top';
  for (let i = 0; i < labels; i += 1) {
    const index = labels === 1 ? 0 : Math.round(i * (points.length - 1) / (labels - 1));
    const textWidth = context.measureText(shortDay(points[index].day)).width;
    context.textAlign = 'center';
    context.fillText(shortDay(points[index].day), Math.max(textWidth / 2, Math.min(width - textWidth / 2, x(index))), box.bottom + 11);
  }

  if (selected !== null && points[selected]) {
    const position = x(selected);
    context.strokeStyle = '#9baaa2';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(position, box.y);
    context.lineTo(position, box.bottom);
    context.stroke();
    for (const [value, color] of [[points[selected].amount, lossColor], [points[selected].average, averageColor]]) {
      if (value === null) continue;
      context.fillStyle = color;
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(position, y(value), 4, 0, 2 * Math.PI);
      context.fill();
      context.stroke();
    }
  }
}

export function WasteTrend({ points }) {
  const frame = useRef(null);
  const canvas = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selectedDay, setSelectedDay] = useState(null);
  const index = points.findIndex(({ day }) => day === selectedDay);
  const chosen = index === -1 ? null : points[index];

  useEffect(() => {
    const container = frame.current;
    const observer = new ResizeObserver(([{ contentRect: { width, height } }]) => setSize({ width, height }));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width && size.height) draw(canvas.current, points, size.width, size.height, chosen ? index : null);
  }, [chosen, index, points, size]);

  function pick(event) {
    if (!event.isPrimary) return;
    const { left, width, height } = event.currentTarget.getBoundingClientRect();
    const { x, right } = layout(width, height);
    const ratio = Math.min(1, Math.max(0, (event.clientX - left - x) / (right - x)));
    setSelectedDay(points[Math.round(ratio * (points.length - 1))]?.day ?? null);
  }

  function endContact(event) {
    if (event.isPrimary && event.pointerType !== 'mouse') setSelectedDay(null);
  }

  function handleKey(event) {
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (event.key === 'Escape') return setSelectedDay(null);
    if (!direction && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1
      : Math.min(points.length - 1, Math.max(0, index + direction));
    setSelectedDay(points[next]?.day ?? null);
  }

  const box = layout(size.width, size.height);
  const anchor = box.x + (box.right - box.x) * (points.length <= 1 ? 0.5 : index / (points.length - 1));
  const tooltipLeft = Math.max(6, Math.min(size.width - 218, anchor + (anchor > size.width / 2 ? -222 : 10)));

  return (
    <>
      <div className="waste-chart-legend">
        <span><i />{waste.dayLoss}</span>
        <span><i />{waste.movingAverage}</span>
      </div>
      <div className="waste-chart-frame" ref={frame} tabIndex={0} role="group" aria-label={waste.chartLabel}
        onKeyDown={handleKey} onPointerDown={pick}
        onPointerMove={(event) => { if (event.pointerType === 'mouse' || event.buttons) pick(event); }}
        onPointerUp={endContact} onPointerCancel={endContact} onLostPointerCapture={endContact}
        onPointerLeave={(event) => { if (event.pointerType === 'mouse') setSelectedDay(null); }}>
        <canvas ref={canvas} aria-hidden="true" />
        {chosen && (
          <div className="waste-chart-tip" role="status" style={{ left: tooltipLeft }}>
            <strong>{longDay(chosen.day)}</strong>
            <span>{waste.dayLoss}<b>{formatCurrency(chosen.amount)}</b></span>
            <span>{waste.movingAverage}<b>{formatCurrency(chosen.average)}</b></span>
          </div>
        )}
      </div>
    </>
  );
}
