'use client';

import CycleHome from './screens/CycleHome';
import MyTasks from './screens/MyTasks';
import { useCycle } from './providers';

/** The landing screen depends on who you are: the status board, or your task list. */
export default function Home() {
  const { isPlanner } = useCycle();
  return isPlanner ? <CycleHome /> : <MyTasks />;
}
