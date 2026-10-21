(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.DeckSimExport=model;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // Turns a planned route into files a robot project can use. Coordinates are Pedro's field
  // frame, which the simulator shares: inches, bottom-left origin, +X right, +Y up, CCW heading.
  const n=v=>Number(v).toFixed(3).replace(/\.?0+$/,'')||'0';
  const javaString=s=>'"'+String(s).replace(/[\\"]/g,c=>'\\'+c).replace(/[\u0000-\u001f]/g,'')+'"';
  // Legs end at pins with a pause, and at the last pin. Leg i is followed, then stop i's pause.
  function legs(route){
    if(route.nonholonomic)return route.segments.map((s,i)=>{const stops=(route.stops||[]).filter(p=>p.segment===i);return {segments:[s],wait:stops.reduce((sum,p)=>sum+p.wait,0),action:stops.map(p=>p.action).filter(Boolean).join(', '),pin:i+1};});
    const out=[];let from=0;const stops=route.stops||[];
    stops.forEach((s,i)=>{const end=Math.min(s.segment,route.segments.length-1),last=i===stops.length-1;
      if((s.wait>0||last)&&end>=from){out.push({segments:route.segments.slice(from,end+1),wait:s.wait,action:s.action||'',pin:i+1});from=end+1;}
      else if(s.wait>0&&out.length){out.at(-1).wait+=s.wait;}});
    return out;
  }
  function validName(className,packageName){
    if(!/^[A-Z][A-Za-z0-9_]{0,63}$/.test(className))throw Error('Class name must start with a capital letter and use letters, digits or _.');
    if(packageName&&!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(packageName))throw Error('Package must look like org.firstinspires.ftc.teamcode.');
  }
  function java(route,layout,options={}){
    const className=options.className||'PlannedRoute',packageName=options.packageName??'org.firstinspires.ftc.teamcode';validName(className,packageName);
    const parts=legs(route),zones=(layout.zones||[]).map(z=>options.polygon(z)),start=layout.start;
    const segment=s=>s.type==='line'?`Paths.line(v(${n(s.points[0].x)}, ${n(s.points[0].y)}), v(${n(s.points[1].x)}, ${n(s.points[1].y)})).constant(${Number.isFinite(s.heading)?`Math.toRadians(${n(s.heading)})`:'HEADING'})`:`Paths.curve(${s.points.map(p=>`v(${n(p.x)}, ${n(p.y)})`).join(', ')}).constant(HEADING)`;
    const leg=l=>l.segments.length===1?`            ${segment(l.segments[0])}`:`            Paths.path(\n${l.segments.map(s=>'                '+segment(s)).join(',\n')}\n            ).constant(HEADING)`;
    return `${packageName?`package ${packageName};\n\n`:''}import com.pedropathing.api.Paths;
import com.pedropathing.math.Pose;
import com.pedropathing.math.Vector2D;
import com.pedropathing.paths.Path;

/**
 * Route planned in Deck Driver Station: ${String(layout.name||'route').replace(/\*\//g,'')} (${layout.fieldName||layout.field}).
 * Pedro Pathing 3.x API. Field frame: inches, origin bottom-left, +X right, +Y up, heading CCW.
 * Robot footprint: ${n(route.footprint.front)} in front, ${n(route.footprint.rear)} in rear, ${n(route.footprint.half)} in each side; clearance ${n(route.clearance)} in.
 * Follow legs()[i], then pause WAIT_SECONDS[i] while running ACTIONS[i], then the next leg.
 * ${route.nonholonomic?'TANK: stop and turn to legs()[i].heading(0) BEFORE each leg; wait for the IMU to settle.':'Holonomic: keep the starting heading throughout.'}
 * Generated file: change the route in the simulator and export again.
 */
public final class ${className} {
    private ${className}() {}

    public static final Pose START = new Pose(${n(start.x)}, ${n(start.y)}, Math.toRadians(${n(start.heading)}));
    public static final double HEADING = Math.toRadians(${n(route.heading)});

    /** Actual field dimensions, inches (custom fields are not rescaled). */
    public static final double FIELD_WIDTH = ${n(layout.width||144)};
    public static final double FIELD_HEIGHT = ${n(layout.height||144)};

    /** Pause after each leg, in seconds. */
    public static final double[] WAIT_SECONDS = {${parts.map(l=>n(l.wait)).join(', ')}};

    /** What the robot does during each pause (names entered in the simulator). */
    public static final String[] ACTIONS = {${parts.map(l=>javaString(l.action)).join(', ')}};

    /** The route split at each pause. Leg i ends at pin ${parts.map(l=>l.pin).join(', ')}. */
    public static Path[] legs() {
        return new Path[] {
${parts.map(leg).join(',\n')}
        };
    }

    /** No-go zones the route keeps clear of, as polygons {x, y} in inches. */
    public static final double[][][] NO_GO_ZONES = {${zones.length?'\n'+zones.map(p=>`        {${p.map(q=>`{${n(q.x)}, ${n(q.y)}}`).join(', ')}}`).join(',\n')+'\n    ':''}};

    private static Vector2D v(double x, double y) {
        return Vector2D.cartesian(x, y);
    }
}
`;
  }
  // Pedro path-file JSON (.pp): a start point and lines with optional Bezier control points.
  function pp(route,layout,options={}){
    const constant={heading:'constant',degrees:+n(route.heading)},parts=legs(route),endsLeg=new Map();
    let index=-1;for(const l of parts){index+=l.segments.length;endsLeg.set(index,l);}
    const lines=route.segments.map((s,i)=>{const end=s.points.at(-1),line={id:`line-${i+1}`,endPoint:{x:+n(end.x),y:+n(end.y),...constant,degrees:+n(s.heading??route.heading)}};
      if(s.type==='curve')line.controlPoints=s.points.slice(1,-1).map(p=>({x:+n(p.x),y:+n(p.y)}));
      const l=endsLeg.get(i);if(l&&l.wait>0){line.waitAfterMs=Math.round(l.wait*1000);if(l.action)line.waitAfterName=l.action;}
      return line;});
    const shapes=(layout.zones||[]).map((z,i)=>({id:z.id,name:`No-go zone ${i+1}`,vertices:options.polygon(z).map(p=>({x:+n(p.x),y:+n(p.y)}))}));
    return JSON.stringify({fileName:`${String(layout.name||'route')}.pp`,version:'deck-sim-1',stopAndTurn:!!route.nonholonomic,timestamp:options.timestamp||new Date().toISOString(),
      field:{type:layout.field||'empty',width:layout.width||144,height:layout.height||144},startPoint:{x:+n(layout.start.x),y:+n(layout.start.y),heading:'constant',degrees:+n(layout.start.heading)},lines,shapes},null,2)+'\n';
  }
  return {legs,java,pp,validName};
});
