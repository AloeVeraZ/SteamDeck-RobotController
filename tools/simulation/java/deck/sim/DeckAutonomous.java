package deck.sim;

/**
 * The simulator's program interface, shaped like an FTC iterative OpMode: init() once, then
 * loop() every control tick (60 Hz simulation time) until finish() or Stop.
 *
 * Code inside these methods may use the genuine Pedro Pathing API (Follower, Paths, Pose,
 * PathChain-style compound paths). On a robot the same logic needs a robot-side adapter: an
 * OpMode that builds its Follower from the robot's real drivetrain and localizer configuration.
 * The simulator never provides that hardware configuration.
 */
public interface DeckAutonomous {
    void init(SimRobot robot) throws Exception;

    void loop(SimRobot robot) throws Exception;
}
