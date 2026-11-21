import { useEffect, useRef, useState } from "react";

const hue = (seed: string) =>
  [...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

// Draws the face (and hat layer) of a Minecraft skin from textures.minecraft.net.
export default function Head({
  skin,
  name,
  size = 32,
  online,
}: {
  skin?: string;
  name: string;
  size?: number;
  online?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDrawn(false);
    if (!skin) return;
    const image = new Image();
    image.onload = () => {
      const context = canvas.current?.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, 8, 8);
      context.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8);
      context.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8);
      setDrawn(true);
    };
    image.src = skin;
    return () => {
      image.onload = null;
    };
  }, [skin]);
  return (
    <span
      className="head"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: drawn ? undefined : `hsl(${hue(name)} 35% 28%)`,
      }}
      aria-hidden
    >
      <canvas ref={canvas} width={8} height={8} hidden={!drawn} />
      {!drawn && name.slice(0, 1).toUpperCase()}
      {online !== undefined && (
        <i className={`presence ${online ? "on" : ""}`} />
      )}
    </span>
  );
}
