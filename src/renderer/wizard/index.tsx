import React from 'react';
import { createRoot } from 'react-dom/client';
import { WizardApp } from './WizardApp';

const root = createRoot(document.getElementById('root')!);
root.render(<WizardApp />);
