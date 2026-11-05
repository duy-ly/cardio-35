export const WORK_DURATION_SEC = 60;
export const REST_DURATION_SEC = 20;
export const CARDIO_TARGET_SEC = 1800; // 30 minutes
export const GET_READY_DURATION_SEC = 10;
export const WARM_UP_DURATION_SEC = 120; // 2 minutes

export function computeRoundCount(cardioTarget = CARDIO_TARGET_SEC, work = WORK_DURATION_SEC, rest = REST_DURATION_SEC) {
  return Math.floor(cardioTarget / (work + rest));
}

export const ROUND_COUNT = computeRoundCount();
export const CARDIO_DURATION_SEC = ROUND_COUNT * (WORK_DURATION_SEC + REST_DURATION_SEC); // 1760s (29:20)

export const CARDIO_POOL = Object.freeze([
  { id: 'jj', name: 'Jumping Jacks', view: 'front' },
  { id: 'bk', name: 'Butt Kicks', view: 'side' },
  { id: 'sj', name: 'Squat Jumps', view: 'side' },
  { id: 'hk', name: 'High Knees', view: 'side' },
  { id: 'sk', name: 'Skater Step & Floor Touch', view: 'front' },
  { id: 'rl', name: 'Reverse Lunge & Knee Drive', view: 'side' },
  { id: 'jr', name: 'Jump Rope', view: 'front' },
  { id: 'kc', name: 'Standing Cross-Body Knee Crunch', view: 'front' },
]);

export const COOLDOWN_STRETCHES = Object.freeze([
  { id: 'nk', name: 'Neck Side Stretch', duration: 40, bilateral: true, position: 'Standing', muscles: 'Neck, upper traps', view: 'front' },
  { id: 'co', name: 'Standing Chest & Shoulder Opener', duration: 30, bilateral: false, position: 'Standing', muscles: 'Chest, front shoulders', view: 'front' },
  { id: 'oss', name: 'Overhead Side Stretch', duration: 40, bilateral: true, position: 'Standing', muscles: 'Lats, obliques', view: 'front' },
  { id: 'qs', name: 'Standing Quad Stretch', duration: 50, bilateral: true, position: 'Standing', muscles: 'Quads', view: 'side' },
  { id: 'cs', name: 'Standing Calf Stretch', duration: 50, bilateral: true, position: 'Standing', muscles: 'Calves', view: 'side' },
  { id: 'hf', name: 'Kneeling Hip Flexor Stretch', duration: 50, bilateral: true, position: 'Kneeling', muscles: 'Hip flexors', view: 'side' },
  { id: 'hs', name: 'Seated Single-Leg Hamstring Stretch', duration: 50, bilateral: true, position: 'Seated', muscles: 'Hamstrings', view: 'side' },
  { id: 'bf', name: 'Seated Butterfly Stretch', duration: 30, bilateral: false, position: 'Seated', muscles: 'Inner thighs', view: 'front' },
  { id: 'fg', name: 'Seated Figure-4 Glute Stretch', duration: 50, bilateral: true, position: 'Seated', muscles: 'Glutes, outer hips', view: 'side' },
  { id: 'tw', name: 'Seated Spinal Twist', duration: 40, bilateral: true, position: 'Seated', muscles: 'Spine, obliques', view: 'front' },
  { id: 'cp', name: "Child's Pose", duration: 30, bilateral: false, position: 'Kneeling', muscles: 'Lower back, lats', view: 'side' },
]);

export const COOLDOWN_TOTAL_SEC = COOLDOWN_STRETCHES.reduce((acc, s) => acc + s.duration, 0); // 460s (7:40)
export const TOTAL_SESSION_SEC = WARM_UP_DURATION_SEC + CARDIO_DURATION_SEC + COOLDOWN_TOTAL_SEC; // 2340s (39:00)

/**
 * Shuffles an array in place using the Fisher-Yates algorithm.
 */
export function shuffle(array, rng = Math.random) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates the sequence of workout rounds.
 * Looping through pool in passes until roundCount is reached.
 * Each pass is shuffled. If the first element of a pass matches the last element
 * of the previous pass, it is swapped with another element in that pass.
 */
export function generateWorkoutSequence(pool = CARDIO_POOL, roundCount = ROUND_COUNT, rng = Math.random) {
  if (!pool || pool.length === 0) {
    throw new Error('Pool cannot be empty');
  }

  const sequence = [];
  const finisherThreshold = Math.max(1, roundCount - 5); // Last 6 rounds (e.g. 17 for 22 rounds)

  while (sequence.length < roundCount) {
    const shuffledPass = shuffle(pool, rng);

    if (sequence.length > 0 && shuffledPass.length > 1) {
      const prevLastId = sequence[sequence.length - 1].exercise.id;
      if (shuffledPass[0].id === prevLastId) {
        // Swap with a random later index in the pass
        const swapIdx = 1 + Math.floor(rng() * (shuffledPass.length - 1));
        [shuffledPass[0], shuffledPass[swapIdx]] = [shuffledPass[swapIdx], shuffledPass[0]];
      }
    }

    const needed = roundCount - sequence.length;
    const toTake = Math.min(needed, shuffledPass.length);

    for (let i = 0; i < toTake; i++) {
      const round = sequence.length + 1;
      sequence.push({
        round,
        exercise: shuffledPass[i],
        isFinisher: round >= finisherThreshold,
      });
    }
  }

  return sequence;
}
