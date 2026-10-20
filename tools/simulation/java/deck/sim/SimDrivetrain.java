package deck.sim;

import com.pedropathing.drivetrain.DrivePowers;
import com.pedropathing.drivetrain.Drivetrain;
import com.pedropathing.utils.Utils;
import java.util.HashMap;
import java.util.Map;

/**
 * A Pedro Drivetrain whose "motors" are the simulator's chassis command. Wheel mixing and
 * saturation follow the mecanum math of Pedro's revhub Mecanum (BSD-3-Clause), or per-module
 * vectors for swerve; the normalized chassis powers are sent to DSIM's drive model, which turns
 * them into wheel-limited motion, acceleration limits and contact physics.
 */
public final class SimDrivetrain implements Drivetrain {
    public enum Kind { MECANUM, SWERVE, TANK }

    private final Kind kind;
    private final double[][] modules; // swerve module positions, scaled so the farthest is radius 1
    private double forward, strafe, turn;
    private boolean brake = true;

    SimDrivetrain(Kind kind, double halfLength, double halfWidth) {
        this.kind = kind;
        double r = Math.hypot(halfLength, halfWidth);
        modules = new double[][] {
            {halfLength / r, halfWidth / r}, {halfLength / r, -halfWidth / r}, {-halfLength / r, halfWidth / r}, {-halfLength / r, -halfWidth / r}
        };
    }

    private double[] mecanum(DrivePowers p) {
        if (kind == Kind.TANK) return new double[] { p.forward() - p.turn(), p.forward() + p.turn() };
        return new double[] {
            p.forward() - p.strafe() - p.turn(),
            p.forward() + p.strafe() + p.turn(),
            p.forward() + p.strafe() - p.turn(),
            p.forward() - p.strafe() + p.turn()
        };
    }

    private double[][] swerve(DrivePowers p) {
        double[][] v = new double[4][2];
        for (int i = 0; i < 4; i++) {
            v[i][0] = p.forward() - p.turn() * modules[i][1];
            v[i][1] = p.strafe() + p.turn() * modules[i][0];
        }
        return v;
    }

    @Override
    public void drive(DrivePowers powers, boolean manual) {
        brake = manual;
        double max = 1;
        if (kind != Kind.SWERVE) for (double w : mecanum(powers)) max = Math.max(max, Math.abs(w));
        else for (double[] w : swerve(powers)) max = Math.max(max, Math.hypot(w[0], w[1]));
        forward = powers.forward() / max;
        strafe = kind == Kind.TANK ? 0 : powers.strafe() / max;
        turn = powers.turn() / max;
    }

    @Override
    public double maxScaling(DrivePowers current, DrivePowers delta) {
        double lambda = 1;
        if (kind != Kind.SWERVE) {
            double[] a = mecanum(current), b = mecanum(delta);
            for (int i = 0; i < a.length; i++) {
                if (Math.abs(b[i]) < 1e-9) continue;
                double t1 = (1 - a[i]) / b[i], t2 = (-1 - a[i]) / b[i];
                if (t1 >= 0 && t1 < lambda) lambda = t1;
                if (t2 >= 0 && t2 < lambda) lambda = t2;
            }
        } else {
            double[][] a = swerve(current), b = swerve(delta);
            for (int i = 0; i < 4; i++) {
                double bb = b[i][0] * b[i][0] + b[i][1] * b[i][1];
                if (bb < 1e-12) continue;
                double ab = a[i][0] * b[i][0] + a[i][1] * b[i][1], aa = a[i][0] * a[i][0] + a[i][1] * a[i][1];
                double disc = ab * ab - bb * (aa - 1);
                if (disc < 0) return 0;
                lambda = Math.min(lambda, (-ab + Math.sqrt(disc)) / bb);
            }
        }
        return Utils.clamp(lambda, 0.0, 1.0);
    }

    @Override
    public void stop() {
        stop(true);
    }

    @Override
    public void stop(boolean brake) {
        this.brake = brake;
        forward = strafe = turn = 0;
    }

    @Override
    public double interpolateVelocity(double xRadius, double yRadius, double theta) {
        return 1.0 / (Math.abs(Math.cos(theta)) / xRadius + Math.abs(Math.sin(theta)) / yRadius);
    }

    double forward() { return forward; }
    double strafe() { return strafe; }
    double turn() { return turn; }
    Kind kind() { return kind; }

    @Override
    public Map<String, Object> debug() {
        Map<String, Object> map = new HashMap<>();
        map.put("kind", kind.name());
        map.put("forward", forward);
        map.put("strafe", strafe);
        map.put("turn", turn);
        map.put("brake", brake);
        return map;
    }
}
