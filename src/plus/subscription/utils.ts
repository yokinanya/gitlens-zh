import { configuration } from '../../configuration';

export function ensurePlusFeaturesEnabled(): Promise<boolean> {
	if (configuration.get('plusFeatures.enabled', undefined, true)) return Promise.resolve(true);
	return Promise.resolve(false);
}
