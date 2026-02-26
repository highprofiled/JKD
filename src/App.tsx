/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef } from 'react';
import { Upload, FileAudio, Download, CheckCircle, Loader2, Settings2, Trash2 } from 'lucide-react';
import { processAudioWithFFmpeg } from './utils/ffmpeg';
import AudioEditor from './components/AudioEditor';

type AudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'm4a' | 'flac' | 'opus' | 'wma' | 'alac';
type BitrateMode = 'cbr' | 'vbr';

interface AudioFile {
  id: string;
  file: File;
  dbIncrease: number;
  reducePeaksDb: number;
  bitrateMode: BitrateMode;
  bitrate: number;
  vbrQuality: number;
  sampleRate: number;
  format: AudioFormat;
  startTime?: number;
  endTime?: number;
  status: 'pending' | 'processing' | 'done' | 'error';
  processedBlob?: Blob;
  error?: string;
}

export default function App() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [globalDb, setGlobalDb] = useState<number>(3);
  const [globalReducePeaksDb, setGlobalReducePeaksDb] = useState<number>(0);
  const [globalBitrateMode, setGlobalBitrateMode] = useState<BitrateMode>('cbr');
  const [globalBitrate, setGlobalBitrate] = useState<number>(192);
  const [globalVbrQuality, setGlobalVbrQuality] = useState<number>(2);
  const [globalSampleRate, setGlobalSampleRate] = useState<number>(44100);
  const [globalFormat, setGlobalFormat] = useState<AudioFormat>('mp3');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const audioFiles = Array.from(newFiles).filter(f => f.type.startsWith('audio/') || f.type.startsWith('video/') || f.name.match(/\.(wav|mp3|ogg|aac|flac|m4a|opus|wma|alac|mp4|mov|avi|mkv|webm)$/i));
    
    const newAudioFiles: AudioFile[] = audioFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      dbIncrease: globalDb,
      reducePeaksDb: globalReducePeaksDb,
      bitrateMode: globalBitrateMode,
      bitrate: globalBitrate,
      vbrQuality: globalVbrQuality,
      sampleRate: globalSampleRate,
      format: globalFormat,
      status: 'pending'
    }));

    setFiles(prev => [...prev, ...newAudioFiles]);
  }, [globalDb, globalReducePeaksDb, globalBitrateMode, globalBitrate, globalVbrQuality, globalSampleRate, globalFormat]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addFiles]);

  const updateFileDb = (id: string, db: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, dbIncrease: db } : f));
  };

  const updateFileReducePeaksDb = (id: string, db: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, reducePeaksDb: db } : f));
  };

  const updateFileBitrateMode = (id: string, mode: BitrateMode) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, bitrateMode: mode } : f));
  };

  const updateFileBitrate = (id: string, bitrate: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, bitrate } : f));
  };

  const updateFileVbrQuality = (id: string, quality: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, vbrQuality: quality } : f));
  };

  const updateFileSampleRate = (id: string, sampleRate: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, sampleRate } : f));
  };

  const updateFileFormat = (id: string, format: AudioFormat) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, format } : f));
  };

  const updateFileCrop = (id: string, startTime: number, endTime: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, startTime, endTime } : f));
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const processFile = async (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'processing', error: undefined } : f));
    
    const fileObj = files.find(f => f.id === id);
    if (!fileObj) return;

    try {
      const blob = await processAudioWithFFmpeg(
        fileObj.file, 
        fileObj.dbIncrease, 
        fileObj.format, 
        fileObj.bitrate,
        fileObj.sampleRate,
        fileObj.bitrateMode,
        fileObj.vbrQuality,
        fileObj.reducePeaksDb,
        fileObj.startTime,
        fileObj.endTime
      );
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'done', processedBlob: blob } : f));
    } catch (error: any) {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', error: error.message || 'Processing failed' } : f));
    }
  };

  const processAll = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    for (const f of pendingFiles) {
      await processFile(f.id);
    }
  };

  const downloadFile = (fileObj: AudioFile) => {
    if (!fileObj.processedBlob) return;
    const url = URL.createObjectURL(fileObj.processedBlob);
    const a = document.createElement('a');
    a.href = url;
    // Append _boosted to original filename
    const nameParts = fileObj.file.name.split('.');
    nameParts.pop(); // remove extension
    const baseName = nameParts.join('.');
    const sign = fileObj.dbIncrease >= 0 ? '+' : '';
    const peaksStr = fileObj.reducePeaksDb > 0 ? `_Limit-${fileObj.reducePeaksDb}dB` : '';
    const bitrateStr = fileObj.bitrateMode === 'vbr' ? `VBR-Q${fileObj.vbrQuality}` : `${fileObj.bitrate}kbps`;
    a.download = `${baseName}_${sign}${fileObj.dbIncrease}dB${peaksStr}_${fileObj.sampleRate/1000}kHz_${bitrateStr}.${fileObj.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 p-4 sm:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-2 mt-8">
          <h1 className="text-4xl font-bold tracking-tight text-neutral-950">Audio RMS Booster</h1>
          <p className="text-neutral-500">Increase the volume (RMS) of your audio files by a custom dB amount.</p>
        </header>

        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="p-6 border-b border-neutral-100 bg-neutral-50/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                <Settings2 className="w-5 h-5" />
              </div>
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor="globalDb" className="block text-sm font-medium text-neutral-700">
                    Default Gain
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      id="globalDb"
                      type="number"
                      step="0.1"
                      value={globalDb}
                      onChange={(e) => setGlobalDb(parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                    <span className="text-sm text-neutral-500">dB</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="globalReducePeaksDb" className="block text-sm font-medium text-neutral-700">
                    Reduce Peaks
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      id="globalReducePeaksDb"
                      type="number"
                      step="0.1"
                      min="0"
                      value={globalReducePeaksDb}
                      onChange={(e) => setGlobalReducePeaksDb(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-24 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                    <span className="text-sm text-neutral-500">dB</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="globalFormat" className="block text-sm font-medium text-neutral-700">
                    Default Format
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      id="globalFormat"
                      value={globalFormat}
                      onChange={(e) => setGlobalFormat(e.target.value as AudioFormat)}
                      className="w-24 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                    >
                      <option value="mp3">MP3</option>
                      <option value="wav">WAV</option>
                      <option value="ogg">OGG</option>
                      <option value="aac">AAC</option>
                      <option value="m4a">M4A</option>
                      <option value="flac">FLAC</option>
                      <option value="opus">OPUS</option>
                      <option value="wma">WMA</option>
                      <option value="alac">ALAC</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="globalBitrateMode" className="block text-sm font-medium text-neutral-700">
                    Bitrate Mode
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      id="globalBitrateMode"
                      value={globalBitrateMode}
                      onChange={(e) => setGlobalBitrateMode(e.target.value as BitrateMode)}
                      className="w-24 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                    >
                      <option value="cbr">CBR</option>
                      <option value="vbr">VBR</option>
                    </select>
                  </div>
                </div>
                {globalBitrateMode === 'cbr' ? (
                  <div>
                    <label htmlFor="globalBitrate" className="block text-sm font-medium text-neutral-700">
                      Default Bitrate
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        id="globalBitrate"
                        value={globalBitrate}
                        onChange={(e) => setGlobalBitrate(parseInt(e.target.value))}
                        className="w-24 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                      >
                        <option value="64">64 kbps</option>
                        <option value="96">96 kbps</option>
                        <option value="128">128 kbps</option>
                        <option value="192">192 kbps</option>
                        <option value="256">256 kbps</option>
                        <option value="320">320 kbps</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="globalVbrQuality" className="block text-sm font-medium text-neutral-700">
                      VBR Quality
                    </label>
                    <div className="flex items-center gap-2 mt-1">
                      <select
                        id="globalVbrQuality"
                        value={globalVbrQuality}
                        onChange={(e) => setGlobalVbrQuality(parseInt(e.target.value))}
                        className="w-32 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                      >
                        <option value="0">0 (Best)</option>
                        <option value="1">1</option>
                        <option value="2">2 (Good)</option>
                        <option value="3">3</option>
                        <option value="4">4 (Medium)</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                        <option value="7">7</option>
                        <option value="8">8</option>
                        <option value="9">9 (Worst)</option>
                      </select>
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="globalSampleRate" className="block text-sm font-medium text-neutral-700">
                    Default Sample Rate
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <select
                      id="globalSampleRate"
                      value={globalSampleRate}
                      onChange={(e) => setGlobalSampleRate(parseInt(e.target.value))}
                      className="w-24 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                    >
                      <option value="8000">8 kHz</option>
                      <option value="11025">11.025 kHz</option>
                      <option value="16000">16 kHz</option>
                      <option value="22050">22.05 kHz</option>
                      <option value="32000">32 kHz</option>
                      <option value="44100">44.1 kHz</option>
                      <option value="48000">48 kHz</option>
                      <option value="88200">88.2 kHz</option>
                      <option value="96000">96 kHz</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            
            <button
              onClick={processAll}
              disabled={files.filter(f => f.status === 'pending' || f.status === 'error').length === 0}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Process All Pending
            </button>
          </div>

          <div className="p-6">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInput}
                multiple
                accept="audio/*"
                className="hidden"
              />
              <Upload className="w-10 h-10 mx-auto text-neutral-400 mb-4" />
              <p className="text-neutral-600 font-medium">Click or drag audio files here</p>
              <p className="text-neutral-400 text-sm mt-1">Supports Audio & Video files (WAV, MP3, M4A, MP4, etc.)</p>
            </div>

            {files.length > 0 && (
              <div className="mt-8 space-y-3">
                <h3 className="text-lg font-semibold text-neutral-800">Files ({files.length})</h3>
                <div className="space-y-3">
                  {files.map(file => (
                    <div key={file.id} className="flex flex-col p-5 bg-white border border-neutral-200 rounded-xl shadow-sm hover:shadow-md transition-shadow gap-5">
                      
                      {/* Top row: Icon, Title, Size, and Remove Button */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 overflow-hidden flex-1">
                          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shrink-0">
                            <FileAudio className="w-7 h-7" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-neutral-900 truncate text-lg" title={file.file.name}>
                              {file.file.name}
                            </p>
                            <p className="text-sm text-neutral-500 mt-0.5">
                              {(file.file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => removeFile(file.id)}
                          className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                          title="Remove File"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Controls Row */}
                      <div className="flex flex-wrap items-center gap-4 bg-neutral-50/80 p-4 rounded-xl border border-neutral-100">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-700">Gain:</span>
                          <input
                            type="number"
                            step="0.1"
                            value={file.dbIncrease}
                            onChange={(e) => updateFileDb(file.id, parseFloat(e.target.value) || 0)}
                            disabled={file.status === 'processing' || file.status === 'done'}
                            className="w-20 px-3 py-1.5 border border-neutral-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
                          />
                          <span className="text-sm text-neutral-500">dB</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-700">Reduce Peaks:</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={file.reducePeaksDb}
                            onChange={(e) => updateFileReducePeaksDb(file.id, Math.max(0, parseFloat(e.target.value) || 0))}
                            disabled={file.status === 'processing' || file.status === 'done'}
                            className="w-20 px-3 py-1.5 border border-neutral-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
                          />
                          <span className="text-sm text-neutral-500">dB</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-700">Format:</span>
                          <select
                            value={file.format}
                            onChange={(e) => updateFileFormat(file.id, e.target.value as AudioFormat)}
                            disabled={file.status === 'processing' || file.status === 'done'}
                            className="w-24 px-3 py-1.5 border border-neutral-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500 bg-white"
                          >
                            <option value="mp3">MP3</option>
                            <option value="wav">WAV</option>
                            <option value="ogg">OGG</option>
                            <option value="aac">AAC</option>
                            <option value="m4a">M4A</option>
                            <option value="flac">FLAC</option>
                            <option value="opus">OPUS</option>
                            <option value="wma">WMA</option>
                            <option value="alac">ALAC</option>
                          </select>
                        </div>

                        {file.format !== 'wav' && file.format !== 'flac' && file.format !== 'alac' && (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-neutral-700">Mode:</span>
                              <select
                                value={file.bitrateMode}
                                onChange={(e) => updateFileBitrateMode(file.id, e.target.value as BitrateMode)}
                                disabled={file.status === 'processing' || file.status === 'done'}
                                className="w-20 px-3 py-1.5 border border-neutral-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500 bg-white"
                              >
                                <option value="cbr">CBR</option>
                                <option value="vbr">VBR</option>
                              </select>
                            </div>

                            {file.bitrateMode === 'cbr' ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-neutral-700">Bitrate:</span>
                                <select
                                  value={file.bitrate}
                                  onChange={(e) => updateFileBitrate(file.id, parseInt(e.target.value))}
                                  disabled={file.status === 'processing' || file.status === 'done'}
                                  className="w-24 px-3 py-1.5 border border-neutral-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500 bg-white"
                                >
                                  <option value="64">64</option>
                                  <option value="96">96</option>
                                  <option value="128">128</option>
                                  <option value="192">192</option>
                                  <option value="256">256</option>
                                  <option value="320">320</option>
                                </select>
                                <span className="text-sm text-neutral-500">kbps</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-neutral-700">Quality:</span>
                                <select
                                  value={file.vbrQuality}
                                  onChange={(e) => updateFileVbrQuality(file.id, parseInt(e.target.value))}
                                  disabled={file.status === 'processing' || file.status === 'done'}
                                  className="w-28 px-3 py-1.5 border border-neutral-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500 bg-white"
                                >
                                  <option value="0">0 (Best)</option>
                                  <option value="1">1</option>
                                  <option value="2">2 (Good)</option>
                                  <option value="3">3</option>
                                  <option value="4">4 (Med)</option>
                                  <option value="5">5</option>
                                  <option value="6">6</option>
                                  <option value="7">7</option>
                                  <option value="8">8</option>
                                  <option value="9">9 (Worst)</option>
                                </select>
                              </div>
                            )}
                          </>
                        )}

                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-700">Sample Rate:</span>
                          <select
                            value={file.sampleRate}
                            onChange={(e) => updateFileSampleRate(file.id, parseInt(e.target.value))}
                            disabled={file.status === 'processing' || file.status === 'done'}
                            className="w-32 px-3 py-1.5 border border-neutral-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-neutral-100 disabled:text-neutral-500 bg-white"
                          >
                            <option value="8000">8 kHz</option>
                            <option value="11025">11.025 kHz</option>
                            <option value="16000">16 kHz</option>
                            <option value="22050">22.05 kHz</option>
                            <option value="32000">32 kHz</option>
                            <option value="44100">44.1 kHz</option>
                            <option value="48000">48 kHz</option>
                            <option value="88200">88.2 kHz</option>
                            <option value="96000">96 kHz</option>
                          </select>
                        </div>
                      </div>

                      {/* Action Row */}
                      <div className="flex justify-end items-center gap-3">
                        {file.status === 'pending' && (
                          <button
                            onClick={() => processFile(file.id)}
                            className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                          >
                            Process File
                          </button>
                        )}

                        {file.status === 'processing' && (
                          <div className="flex items-center gap-2 text-indigo-600 px-4 py-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-medium">Processing...</span>
                          </div>
                        )}

                        {file.status === 'done' && (
                          <>
                            <div className="flex items-center gap-1.5 text-emerald-600 px-2">
                              <CheckCircle className="w-5 h-5" />
                              <span className="text-sm font-medium">Done</span>
                            </div>
                            <button
                              onClick={() => downloadFile(file)}
                              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                            >
                              <Download className="w-4 h-4" />
                              Download
                            </button>
                          </>
                        )}

                        {file.status === 'error' && (
                          <div className="flex items-center gap-3">
                            <div className="group relative">
                              <span className="text-sm text-red-500 font-medium max-w-[200px] truncate block cursor-help">
                                Error (Hover to view)
                              </span>
                              <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 p-2 bg-neutral-900 text-white text-xs rounded shadow-lg z-10 whitespace-pre-wrap">
                                {file.error}
                              </div>
                            </div>
                            <button
                              onClick={() => processFile(file.id)}
                              className="px-5 py-2.5 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Audio Editor for Playback and Cropping */}
                      {file.status === 'pending' && (
                        <div className="mt-1 pt-5 border-t border-neutral-100">
                          <AudioEditor 
                            file={file.file} 
                            onCropChange={(start, end) => updateFileCrop(file.id, start, end)} 
                          />
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

