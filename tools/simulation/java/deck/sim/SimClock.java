package deck.sim;

/**
 * Simulation time injected into the Deck controller. Pausing or changing playback speed
 * cannot advance control timing in wall-clock time. Only the bridge advances this clock,
 * once per physics tick.
 */
public final class SimClock {
    private static volatile long nanos = 1_000_000_000L;

    private SimClock() {}

    public static long nanoTime() {
        return nanos;
    }

    static void setSeconds(double seconds) {
        long next = 1_000_000_000L + Math.round(seconds * 1e9);
        if (next < nanos) throw new IllegalStateException("Simulation time cannot run backwards.");
        nanos = next;
    }
}
