import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsApp } from './SettingsApp';

const root = createRoot(document.getElementById('root')!);
root.render(<SettingsApp />);
