import React from 'react';
import { motion } from 'motion/react';
import type { Corners, DeviceType } from '../types';
import { CalibrationEditor } from './CalibrationEditor';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (corners: Corners, name: string, type: DeviceType) => void;
  imageUrl: string;
  previewUrl?: string;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  imageUrl,
  previewUrl,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-[#0F172A] border border-slate-700 rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        <CalibrationEditor
          active={isOpen}
          imageUrl={imageUrl}
          previewUrl={previewUrl}
          variant="fullscreen"
          onSave={onSave}
          onCancel={onClose}
        />
      </motion.div>
    </div>
  );
};
