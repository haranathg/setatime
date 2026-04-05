import { v4 as uuidv4 } from 'uuid';
import type { SubTask } from '../types';
import { getAuthHashAsync } from './syncService';

const AI_API_URL = import.meta.env.VITE_AI_API_URL || '/api/ai-breakdown';

export async function generateSubTasks(mainTask: string, mainTime: string): Promise<SubTask[]> {
  const authHash = await getAuthHashAsync();
  const response = await fetch(AI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mainTask, mainTime, authHash }),
  });

  if (!response.ok) {
    throw new Error('AI service unavailable. Please try again.');
  }

  const data = await response.json();

  // Expect: { subTasks: [{ time: "HH:MM", label: "..." }, ...] }
  return data.subTasks.map((s: { time: string; label: string }) => ({
    id: uuidv4(),
    time: s.time,
    label: s.label,
    completed: false,
  }));
}
