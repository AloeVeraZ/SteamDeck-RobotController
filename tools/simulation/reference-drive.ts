// Reference: goBILDA 5203-2402-0019, 12 V, 312 RPM, 24.3 kg·cm stall torque,
// 9.2 A stall / 0.25 A free current. Changing wheel RPM represents re-gearing
// the same motor. Efficiency and tile friction are estimates, not vendor specs.
export function referenceDrive(spec:any,p:any,rpm:number){
  const mass=Math.max(1e-9,spec.massLb*.45359237),radius=(spec.deckWheelMm??104)/2000;
  const motors=spec.deckDriveMotors??4,efficiency=.7,mu=.8,g=9.80665;
  const torque=24.3*.0980665*312/rpm;
  const force=motors*torque*efficiency/radius;
  const acceleration=Math.min(force/mass,mu*g)*p.accelMult/1.12;
  const length=spec.length*.0254,width=spec.width*.0254;
  const lever=Math.hypot(length,width)/2,inertia=mass*(length*length+width*width)/12;
  const angular=mass*acceleration*lever/Math.max(1e-12,inertia);
  const maxSpeed=2*Math.PI*radius*rpm/60*.9*p.speedMult/.0254;
  return {maxSpeed,accel:acceleration/.0254,maxTurn:Math.min(maxSpeed*.0254/Math.max(1e-6,lever)*p.turnMult,12),turnAccel:angular,strafeMult:p.strafeMult,saturation:p.saturation};
}
