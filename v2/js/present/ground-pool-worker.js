// A worker of Generate's ground pool (ground-tasks.js groundTaskPool): it draws runs of the present-day world's surface
// from the plan it is handed. A browser module worker or a Node worker thread.

import { serveTasks } from '../core/task-pool.js';
import { GROUND_TASKS } from './ground-tasks.js';

serveTasks(GROUND_TASKS);
