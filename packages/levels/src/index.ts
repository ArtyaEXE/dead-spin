import {LevelSchema, type Level} from '@dead-spin/shared';

import l1 from './data/1.json' with {type: 'json'};
import l2 from './data/2.json' with {type: 'json'};
import l3 from './data/3.json' with {type: 'json'};
import l4 from './data/4.json' with {type: 'json'};
import l5 from './data/5.json' with {type: 'json'};
import l6 from './data/6.json' with {type: 'json'};
import l7 from './data/7.json' with {type: 'json'};
import l8 from './data/8.json' with {type: 'json'};
import l9 from './data/9.json' with {type: 'json'};
import l10 from './data/10.json' with {type: 'json'};
import l11 from './data/11.json' with {type: 'json'};
import l12 from './data/12.json' with {type: 'json'};
import l13 from './data/13.json' with {type: 'json'};
import l14 from './data/14.json' with {type: 'json'};
import l15 from './data/15.json' with {type: 'json'};


const raw = [l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15];


export const levels: readonly Level[] = raw.map((data, idx) => {
	const result = LevelSchema.safeParse(data);
	if (!result.success) {
		throw new Error(
			`Invalid level at index ${idx}: ${result.error.issues.map(i => i.path.join('.') + ' ' + i.message).join('; ')}`
		);
	}
	return result.data;
});


export function getLevelByNumber(n: number): Level | undefined {
	return levels[n - 1];
}
