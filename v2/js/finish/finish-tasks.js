// The finish's work that splits into pieces (core/task-pool.js): each task a pure function of the piece it is sent and of
// what the pool shared with every worker — the same code the finish runs in place where it has no pool.

import { TaskPool } from '../core/task-pool.js';
import { picturePieceTask, lookBandTask, lookPieceTask } from './finish-raster.js';
import { climateCellsTask } from './finish-cells.js';

export const FINISH_TASKS = {
    picturePiece: picturePieceTask,
    lookBand: lookBandTask,
    lookPiece: lookPieceTask,
    climateCells: climateCellsTask,
};

/** A pool for the finish's tasks (null where workers cannot be started: the finish then works in place). */
export function finishTaskPool(size = null) {
    return TaskPool.create(new URL('./finish-pool-worker.js', import.meta.url), size);
}
