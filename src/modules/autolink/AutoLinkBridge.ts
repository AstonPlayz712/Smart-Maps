import type {
  NavigationService,
  NavigationRoute,
  NavigationState,
  Unsubscribe
} from '../../services/NavigationService';
import type { LatLng } from '../../engine/types';

/**
 * AutoLinkBridge — the AutoLink module's subscriber to NavigationService.
 *
 * In production this would forward state across the AutoLink transport to a
 * companion device (in-car HUD, watch, glasses). For the proto it logs to the
 * console so developers can verify the channel is plumbed end-to-end:
 *
 *   • location stream  → "drive-by-drive" feed
 *   • route stream     → polyline + ETA mirroring
 *   • state stream     → start/arrive/stop signals for the companion UI
 *
 * AutoLink never talks to the engine. It only knows about NavigationService.
 */
export class AutoLinkBridge {
  private unsubs: Unsubscribe[] = [];
  private active = false;

  constructor(private navigationService: NavigationService) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.unsubs.push(
      this.navigationService.onLocationUpdate(this.handleLocation, 'autolink'),
      this.navigationService.onRouteUpdate(this.handleRoute, 'autolink'),
      this.navigationService.onNavigationStateChange(this.handleState, 'autolink')
    );
  }

  stop(): void {
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  private handleLocation = (loc: LatLng): void => {
    console.debug('[AutoLink] location', loc);
  };

  private handleRoute = (route: NavigationRoute | null): void => {
    if (route) {
      console.debug(
        '[AutoLink] route',
        `${(route.distanceMeters / 1000).toFixed(2)} km`,
        `~${Math.round(route.durationSec / 60)} min`
      );
    } else {
      console.debug('[AutoLink] route cleared');
    }
  };

  private handleState = (state: NavigationState): void => {
    console.debug('[AutoLink] state →', state);
  };
}
