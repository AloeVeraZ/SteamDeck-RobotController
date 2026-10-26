package deck.sim;

/**
 * The simulator's program interface, shaped like an FTC iterative OpMode: init() once, then
 * loop() every control tick (60 Hz simulation time) until finish() or Stop.
 *
 * Code inside these methods may use the Deck controller API and compound paths.
 * For a robot, export the SDK-only OnBot Java OpMode or the Control Hub TeamCode files;
 * those include the controller and hardware adapter. This simulation interface stays local.
 */
public interface DeckAutonomous {
    void init(SimRobot robot) throws Exception;

    void loop(SimRobot robot) throws Exception;
}
