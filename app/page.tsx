'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import MyTasks from './screens/MyTasks';
import { useCycle } from './providers';

/** Planners land on Requests; stakeholders keep the task list at /. */
export default function Home() {
  const { isPlanner } = useCycle();
  const router = useRouter();

  useEffect(() => {
    if (isPlanner) router.replace('/requests');
  }, [isPlanner, router]);

  if (isPlanner) return null;
  return <MyTasks />;
}
