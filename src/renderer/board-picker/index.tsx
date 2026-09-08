import React from 'react';
import { createRoot } from 'react-dom/client';
import { BoardPickerApp } from './BoardPickerApp';

const root = createRoot(document.getElementById('root')!);
root.render(<BoardPickerApp />);
