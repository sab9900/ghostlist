import { Pipe, PipeTransform } from '@angular/core';


@Pipe({ name: 'swipeClamp', standalone: true })
export class SwipeClampPipe implements PipeTransform {
    transform(value: number): number {
        return Math.min(1, Math.max(0, value));
    }
}
