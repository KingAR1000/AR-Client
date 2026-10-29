import { useEffect, useRef } from "react";

// Original decorative artwork; no Minecraft assets and no background render loop.
export default function World() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d", { alpha: false });
    if (!element || !ctx) return;
    const size = 48;
    const noise = (x: number, z: number) => {
      const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return value - Math.floor(value);
    };
    const heights = Array.from({ length: size }, (_, x) =>
      Array.from({ length: size }, (_, z) => {
        const river = 22 + 5 * Math.sin(z * 0.12);
        const distance = Math.abs(x - river);
        if (distance < 2.5) return 1;
        return Math.max(
          2,
          Math.floor(
            3 +
              Math.sin(x * 0.16 + 1) * Math.cos(z * 0.15) * 3 +
              Math.sin(z * 0.18) * 2 +
              Math.min(distance, 12) * 0.65 +
              noise(x, z) * 0.8,
          ),
        );
      }),
    );
    type Point = [number, number, number];
    function draw() {
      if (!element || !ctx) return;
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * dpr);
      element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#151515";
      ctx.fillRect(0, 0, width, height);
      const scale = Math.max(width / 100, height / 37);
      const project = ([x, z, h]: Point): [number, number] => [
        width * 0.76 + (x - z) * scale,
        height * -0.28 + (x + z) * scale * 0.48 - h * scale * 0.9,
      ];
      const face = (points: Point[], color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        points.forEach((point, i) =>
          i ? ctx.lineTo(...project(point)) : ctx.moveTo(...project(point)),
        );
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      };
      const cube = (
        x: number,
        z: number,
        h: number,
        base: number,
        top: string,
        left: string,
        right: string,
        w = 1,
      ) => {
        face(
          [
            [x + w, z, h],
            [x + w, z + w, h],
            [x + w, z + w, base],
            [x + w, z, base],
          ],
          left,
        );
        face(
          [
            [x, z + w, h],
            [x + w, z + w, h],
            [x + w, z + w, base],
            [x, z + w, base],
          ],
          right,
        );
        face(
          [
            [x, z, h],
            [x + w, z, h],
            [x + w, z + w, h],
            [x, z + w, h],
          ],
          top,
        );
      };
      for (let sum = 0; sum < size * 2; sum++) {
        for (let x = 0; x < size; x++) {
          const z = sum - x;
          if (z < 0 || z >= size) continue;
          const h = heights[x][z];
          const water = h === 1;
          const light = Math.floor(71 + h * 6 + noise(x, z) * 14);
          cube(
            x,
            z,
            h,
            0,
            water ? "#aaaaaa" : `rgb(${light},${light},${light})`,
            "#303030",
            "#484848",
          );
          if (water && noise(x + 2, z) > 0.4) {
            const [px, py] = project([x + 0.2, z + 0.4, h + 0.01]);
            ctx.fillStyle = "#eeeeee42";
            ctx.fillRect(px, py, scale * 0.65, 1);
          }
          if (
            h > 4 &&
            x > 2 &&
            z > 2 &&
            x < size - 3 &&
            z < size - 3 &&
            noise(x + 42, z + 89) > 0.955
          ) {
            cube(
              x + 0.3,
              z + 0.3,
              h + 3,
              h,
              "#777777",
              "#363636",
              "#585858",
              0.4,
            );
            for (let layer = 0; layer < 3; layer++) {
              const w = layer === 2 ? 1 : 2;
              cube(
                x - 0.5 + (2 - w) / 2,
                z - 0.5 + (2 - w) / 2,
                h + 3 + layer * 0.9,
                h + 2.2 + layer * 0.9,
                layer === 2 ? "#bbbbbb" : "#999999",
                "#4c4c4c",
                "#686868",
                w,
              );
            }
          }
        }
      }
    }
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return <canvas className="world-art" ref={canvas} aria-hidden="true" />;
}
