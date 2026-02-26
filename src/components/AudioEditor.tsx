import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import { Play, Pause, Scissors } from 'lucide-react';

interface AudioEditorProps {
  file: File;
  onCropChange: (start: number, end: number) => void;
}

export default function AudioEditor({ file, onCropChange }: AudioEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const activeRegionRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#a5b4fc',
      progressColor: '#4f46e5',
      cursorColor: '#4f46e5',
      height: 60,
      normalize: true,
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());
    
    wavesurferRef.current = ws;
    regionsRef.current = regions;

    const url = URL.createObjectURL(file);
    ws.load(url);

    ws.on('ready', () => {
      const dur = ws.getDuration();
      setDuration(dur);
      
      // Create initial region covering the whole file
      const region = regions.addRegion({
        start: 0,
        end: dur,
        color: 'rgba(79, 70, 229, 0.2)',
        drag: true,
        resize: true,
      });
      activeRegionRef.current = region;
      
      onCropChange(0, dur);
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    regions.on('region-updated', (region) => {
      activeRegionRef.current = region;
      onCropChange(region.start, region.end);
    });

    return () => {
      ws.destroy();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const togglePlay = () => {
    if (isPlaying) {
      wavesurferRef.current?.pause();
    } else {
      if (activeRegionRef.current) {
        activeRegionRef.current.play();
      } else if (wavesurferRef.current) {
        wavesurferRef.current.play();
      }
    }
  };

  return (
    <div className="w-full space-y-2">
      <div ref={containerRef} className="w-full rounded-md overflow-hidden bg-neutral-50 border border-neutral-200" />
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="p-1.5 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <span className="text-xs text-neutral-500 flex items-center gap-1">
          <Scissors className="w-3 h-3" /> Drag edges to crop
        </span>
      </div>
    </div>
  );
}
