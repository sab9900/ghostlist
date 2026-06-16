import { Pipe, PipeTransform } from '@angular/core';

/** Clamps a value to [0, 1] — used to cap the swipe-reveal opacity. */
@Pipe({ name: 'swipeClamp', standalone: true })
export class SwipeClampPipe implements PipeTransform {
    transform(value: number): number {
        return Math.min(1, Math.max(0, value));
    }
}
