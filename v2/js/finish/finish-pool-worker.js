// A worker of the finish's task pool (finish-tasks.js finishTaskPool): it runs the finish's pieces — a band of the
// picture's rows, a run of cells of the final climate — each from what it is sent. A browser module worker or a Node
// worker thread.

import { serveTasks } from '../core/task-pool.js';
import { FINISH_TASKS } from './finish-tasks.js';

serveTasks(FINISH_TASKS);
