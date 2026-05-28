import { CoordDistance3D, SubCoord3D } from './coord3d.js';

export function BezierTweenFunction (distance, index, count)
{
    let t = index / count;
	return distance * (t * t * (3.0 - 2.0 * t));
}

export function LinearTweenFunction (distance, index, count)
{
    return index * distance / count;
}

export function ParabolicTweenFunction (distance, index, count)
{
    let t = index / count;
    let t2 = t * t;
    return distance * (t2 / (2.0 * (t2 - t) + 1.0));
}

export function TweenCoord3D (a, b, count, tweenFunc)
{
	let dir = SubCoord3D (b, a).Normalize ();
	let distance = CoordDistance3D (a, b);
	let result = [];
	for (let i = 0; i < count; i++) {
        let step = tweenFunc (distance, i, count - 1);
		result.push (a.Clone ().Offset (dir, step));
	}
	return result;
}

export function TweenNumber (a, b, count, tweenFunc)
{
    let result = [];
    for (let i = 0; i < count; i++) {
        let t = i / (count - 1);
        let val = a + (b - a) * tweenFunc (t);
        result.push (val);
    }
    return result;
}
