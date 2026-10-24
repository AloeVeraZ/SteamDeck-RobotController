(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.DeckSimExport=model;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // Turns a planned route into files a robot project can use. Coordinates are the application field
  // frame, which the simulator shares: inches, bottom-left origin, +X right, +Y up, CCW heading.
  const n=v=>Number(v).toFixed(3).replace(/\.?0+$/,'')||'0';
  const finite=Number.isFinite,norm=d=>((d%360)+540)%360-180;
  const javaString=s=>'"'+String(s).replace(/[\\"]/g,c=>'\\'+c).replace(/[\u0000-\u001f]/g,'')+'"';
  const comment=s=>String(s||'').replace(/\*\//g,'* /').replace(/[\r\n]+/g,' ').trim();
  const endOf=s=>finite(s.endHeading)?s.endHeading:s.heading;
  // Which pin's path each segment belongs to (0-based): the planner marks it, older routes are matched.
  function pathIndex(route){const stops=route.stops||[];let k=0;return route.segments.map((s,i)=>{if(Number.isInteger(s.to))return s.to;while(k<stops.length-1&&stops[k].segment<i)k++;return k;});}
  // A leg is what the robot drives without stopping. Legs end at the last pin; at pins with a pause,
  // an action or a turn; where an action path starts or ends; and, on turning routes, where the next
  // segment needs a heading the robot does not have yet (it stops and turns in place first).
  // After leg i the robot settles, turns to legs[i].turn if set, pauses, then runs the pin's action.
  function legs(route){
    const segs=route.segments,stops=route.stops||[],turning=!!(route.nonholonomic||route.turns||segs.some(s=>finite(s.heading)));
    const to=pathIndex(route),pathOf=k=>stops[k]?.path||{},powerOf=k=>finite(pathOf(k).power)?Math.max(0,Math.min(1,pathOf(k).power)):null,acting=k=>pathOf(k).kind==='action',out=[];let from=0;
    segs.forEach((s,i)=>{
      const here=stops.map((p,k)=>({...p,k})).filter(p=>p.segment===i),next=segs[i+1];
      const wait=here.reduce((t,p)=>t+(finite(p.wait)?p.wait:0),0),acting_=here.find(p=>p.action),action=acting_?.action||'',actionSeconds=finite(acting_?.actionSeconds)?acting_.actionSeconds:null,cell=acting_?.cell==='other'?1:0,turn=[...here].reverse().find(p=>finite(p.turn))?.turn??null;
      const end=!next||wait>0||!!action||turn!==null||(turning&&Math.abs(norm(next.heading-endOf(s)))>1e-6)||(to[i+1]!==to[i]&&(acting(to[i])||acting(to[i+1])||powerOf(to[i])!==powerOf(to[i+1])));
      if(!end)return;
      const first=segs[from],path=pathOf(to[i]);
      out.push({segments:segs.slice(from,i+1),pin:here.length?here.at(-1).k+1:0,path:to[i]+1,wait,action,actionSeconds,cell,note:here.map(p=>p.note).filter(Boolean).join(' '),turn,
        power:powerOf(to[i]),heading:finite(first.heading)?first.heading:route.heading,endHeading:finite(endOf(s))?endOf(s):route.heading,
        moving:path.kind==='action'?{action:path.action||'',note:path.note||'',seconds:finite(path.actionSeconds)?path.actionSeconds:null,cell:path.cell==='other'?1:0}:null,rotate:path.rotate==='spin'?`spins ${Math.abs(path.spins)} turn${Math.abs(path.spins)>1?'s':''} ${path.spins>0?'counter-clockwise':'clockwise'}`:path.rotate==='relative'?`turns by ${n(path.angle)}°`:path.rotate==='start'?'returns to the starting heading':path.rotate==='track'?`tracks target (${n(path.target?.x)}, ${n(path.target?.y)})`:path.rotate==='tangent'?'faces along the path':path.rotate==='reverse'?'faces backwards along the path':path.rotate==='turn'?`turns to ${n(path.heading)}°`:''});
      from=i+1;
    });
    return out;
  }
  // Action names become code identifiers: "Shoot ball" → shootBall (Java) and shoot_ball (Python).
  // The same name used at several pins or paths runs the same code.
  const JAVA_WORDS=new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield init stop run'.split(' '));
  const words=name=>String(name||'').normalize('NFKD').replace(/[^\w\s]/g,' ').replace(/_/g,' ').trim().split(/\s+/).filter(Boolean);
  function slot(name){const w=words(name);if(!w.length)return '';let id=w.map((x,i)=>i?x[0].toUpperCase()+x.slice(1).toLowerCase():x.toLowerCase()).join('');if(/^\d/.test(id))id='action'+id[0].toUpperCase()+id.slice(1);return JAVA_WORDS.has(id)?id+'Action':id.slice(0,48);}
  function pySlot(name){const w=words(name);if(!w.length)return '';let id=w.map(x=>x.toLowerCase()).join('_');if(/^\d/.test(id))id='action_'+id;return ['and','as','assert','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield','run','stop','init','setup','math','os','time','importlib','drive','turn','hold','aim','action','plan','load_actions','create_autonomous','wrap180'].includes(id)?id+'_action':id.slice(0,48);}
  // Every named action with where it runs, in route order.
  function actions(route){
    const map=new Map(),add=(name,where)=>{const id=slot(name);if(!id)return;if(!map.has(id))map.set(id,{slot:id,py:pySlot(name),name,uses:[]});map.get(id).uses.push(where);};
    const all=legs(route);
    for(const [i,l] of all.entries()){
      if(l.moving?.action&&!all.slice(0,i).some(o=>o.path===l.path&&o.moving))add(l.moving.action,{moving:true,path:l.path,note:l.moving.note,rotate:l.rotate});
      if(l.action)add(l.action,{moving:false,pin:l.pin,wait:l.wait,note:l.note});
    }
    return [...map.values()];
  }
  const where=u=>u.moving?`while driving the path to pin ${u.path}${u.rotate?` (the robot ${u.rotate})`:''}`:`stopped at pin ${u.pin}${u.wait>0?`, pause ${n(u.wait)} s`:''}`;
  function describe(l,i){
    const parts=[`Leg ${i+1}: ${l.moving?`ACTION PATH${l.moving.action?` "${comment(l.moving.action)}"`:''}`:'drive'} to ${l.pin?`pin ${l.pin}`:'a turn point'}`];
    if(l.rotate)parts.push(`the robot ${l.rotate} while driving`);if(l.moving?.note)parts.push(comment(l.moving.note));
    if(l.turn!==null)parts.push(`then turn to ${n(l.turn)}°`);if(l.wait>0)parts.push(`pause ${n(l.wait)} s`);if(l.action)parts.push(`run "${comment(l.action)}"${finite(l.actionSeconds)?` for ${n(l.actionSeconds)} s`:" until done"}`);if(l.note)parts.push(comment(l.note));
    return parts.join('; ')+'.';
  }
  function validName(className,packageName){
    if(!/^[A-Z][A-Za-z0-9_]{0,63}$/.test(className))throw Error('Class name must start with a capital letter and use letters, digits or _.');
    if(new Set(['DeckFollower','Pose','Point','Path','Paths','Interpolator','Config','Drivetrain','Localizer','MotionState','Velocity','DrivePowers','Constants','RobotDrive','RouteActions','RobotActions','LinearOpMode','HardwareMap','ElapsedTime']).has(className))throw Error('Class name conflicts with a generated controller type. Choose a route name such as PlannedRoute.');
    if(packageName&&!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(packageName))throw Error('Package must look like org.firstinspires.ftc.teamcode.');
    if(packageName?.split('.').some(p=>JAVA_WORDS.has(p)))throw Error('Package names cannot contain Java reserved words.');
  }
  function java(route,layout,options={}){
    const className=options.className||'PlannedRoute',packageName=options.packageName??'org.firstinspires.ftc.teamcode';validName(className,packageName);
    const parts=legs(route),zones=(layout.zones||[]).map(z=>options.polygon(z)),start=layout.start,rad=d=>`Math.toRadians(${n(d)})`;
    const heading=s=>s.tangent?`.heading(tangent(${s.reverse?'true':'false'}))`:s.target?`.heading(face(${n(s.target.x)}, ${n(s.target.y)}))`:finite(s.endHeading)?`.heading(turn(${n(s.heading)}, ${n(s.endHeading)}))`:finite(s.heading)?`.constant(${rad(s.heading)})`:'.constant(HEADING)';
    const segment=s=>(s.type==='line'?`Paths.line(v(${n(s.points[0].x)}, ${n(s.points[0].y)}), v(${n(s.points[1].x)}, ${n(s.points[1].y)}))`:`Paths.curve(${s.points.map(p=>`v(${n(p.x)}, ${n(p.y)})`).join(', ')})`)+heading(s);
    const leg=l=>l.segments.length===1?`            ${segment(l.segments[0])}`:`            Paths.path(\n${l.segments.map(s=>'                '+segment(s)).join(',\n')}\n            )`;
    const headings=key=>parts.map(l=>finite(l[key])?rad(l[key]):'HEADING').join(', ');
    return `${packageName?`package ${packageName};\n\n`:''}import deck.pathing.DeckFollower.Paths;
import deck.pathing.DeckFollower.Pose;
import deck.pathing.DeckFollower.Point;
import deck.pathing.DeckFollower.Path;
import deck.pathing.DeckFollower.Interpolator;

/**
 * Route planned in Deck Driver Station: ${comment(layout.name||'route')} (${comment(layout.fieldName||layout.field)}).
 * Deck route controller API. Field frame: inches, origin bottom-left, +X right, +Y up, heading CCW.
 * Robot footprint: ${n(route.footprint.front)} in front, ${n(route.footprint.rear)} in rear, ${n(route.footprint.half)} in each side; clearance ${n(route.clearance)} in.
 * ${route.nonholonomic?'TANK: stop and turn to START_HEADING[i] BEFORE each leg; wait for the IMU to settle.':route.turns?'TURNS: where START_HEADING[i] differs from the heading the robot already has, stop and turn in place to it BEFORE following the leg.':'Holonomic: keep the starting heading throughout.'}
 *
 * For each leg i: face START_HEADING[i], follow legs()[i] while running MOVING_ACTIONS[i] (if any),
 * settle, turn to TURN_AFTER[i] (if not NaN), pause WAIT_SECONDS[i], then run ACTIONS[i] for ACTION_SECONDS[i].
${parts.map((l,i)=>` * ${describe(l,i)}`).join('\n')}
 * Generated file: change the route in the simulator and export again.
 */
public final class ${className} {
    private ${className}() {}

    public static final Pose START = new Pose(${n(start.x)}, ${n(start.y)}, Math.toRadians(${n(start.heading)}));
    public static final double HEADING = Math.toRadians(${n(route.heading)});

    /** Actual field dimensions, inches (custom fields are not rescaled). */
    public static final double FIELD_WIDTH = ${n(layout.width||144)};
    public static final double FIELD_HEIGHT = ${n(layout.height||144)};

    /** Pause at the pin after each leg, before its action, in seconds. */
    public static final double[] WAIT_SECONDS = {${parts.map(l=>n(l.wait)).join(', ')}};

    /** Motor power ceiling per leg, including setup defaults (0 disables that leg). */
    public static final double[] MOTOR_POWER = {${parts.map(l=>n(l.power??route.defaultPower??options.defaultPower??.8)).join(', ')}};

    /** The action run at the pin after each leg, as named in the simulator ("" for none). */
    public static final String[] ACTIONS = {${parts.map(l=>javaString(l.action)).join(', ')}};

    /** Which hive cell each pin action aims at: 0 the cell up at the start, 1 the other cell. */
    public static final int[] ACTION_CELL = {${parts.map(l=>l.cell||0).join(', ')}};

    /** How long each pin action runs, in seconds (0: until it reports done). */
    public static final double[] ACTION_SECONDS = {${parts.map(l=>n(l.actionSeconds||0)).join(', ')}};

    /** The action run WHILE driving each leg: action paths ("" for regular paths). */
    public static final String[] MOVING_ACTIONS = {${parts.map(l=>javaString(l.moving?.action||'')).join(', ')}};

    /** Which hive cell each action path's action aims at (0 start cell, 1 the other cell). */
    public static final int[] MOVING_CELL = {${parts.map(l=>l.moving?.cell||0).join(', ')}};

    /** How long each action path's action runs from the start of its path, in seconds (0: the whole path). */
    public static final double[] MOVING_SECONDS = {${parts.map(l=>n(l.moving?.seconds||0)).join(', ')}};

    /** Which pin's path each leg drives (1 = the path from the start to pin 1). */
    public static final int[] PATH = {${parts.map(l=>l.path).join(', ')}};

    /** The pin each leg ends at (0 = a turn point between pins). */
    public static final int[] PIN = {${parts.map(l=>l.pin).join(', ')}};

    /** Heading to face before each leg, radians. */
    public static final double[] START_HEADING = {${headings('heading')}};

    /** Heading to turn to in place after each leg, radians (NaN = no turn). */
    public static final double[] TURN_AFTER = {${parts.map(l=>l.turn===null?'Double.NaN':rad(l.turn)).join(', ')}};

    /** The route split into legs (see above). Leg i ends at pin ${parts.map(l=>l.pin||'-').join(', ')}. */
    public static Path[] legs() {
        return new Path[] {
${parts.map(leg).join(',\n')}
        };
    }

    /** No-go zones the route keeps clear of, as polygons {x, y} in inches. */
    public static final double[][][] NO_GO_ZONES = {${zones.length?'\n'+zones.map(p=>`        {${p.map(q=>`{${n(q.x)}, ${n(q.y)}}`).join(', ')}}`).join(',\n')+'\n    ':''}};

    private static Point v(double x, double y) {
        return Point.cartesian(x, y);
    }

    /** Face a fixed field target at every point of the actual curve. */
    private static Interpolator face(double x, double y) {
        return (curve, t) -> { Point p = curve.get(t); return Math.atan2(y - p.y(), x - p.x()); };
    }

    /** Face along the path (backwards: reverse), from the curve's direction at each point. */
    private static Interpolator tangent(boolean reverse) {
        return (curve, t) -> { Point a = curve.get(Math.max(0, t - 1e-4)), b = curve.get(Math.min(1, t + 1e-4)); return Math.atan2(b.y() - a.y(), b.x() - a.x()) + (reverse ? Math.PI : 0); };
    }

    /** Heading that turns steadily from one angle to another (degrees; may span whole spins) along a path. */
    private static Interpolator turn(double fromDegrees, double toDegrees) {
        double from = Math.toRadians(fromDegrees), by = Math.toRadians(toDegrees - fromDegrees), full = 2 * Math.PI;
        return (curve, t) -> ((from + by * t) % full + full) % full;
    }
}
`;
  }
  // Deck path-file JSON (.pp): a start point and lines with optional Bezier control points.
  const COLORS=['#2563eb','#16a34a','#d97706','#9333ea','#dc2626','#0891b2','#db2777','#65a30d'];
  function pp(route,layout,options={}){
    const constant={heading:'constant',degrees:+n(route.heading)},parts=legs(route),endsLeg=new Map(),to=pathIndex(route),stops=route.stops||[];
    let index=-1;for(const l of parts){index+=l.segments.length;endsLeg.set(index,l);}
    const lines=route.segments.map((s,i)=>{const end=s.points.at(-1),line={id:`line-${i+1}`,endPoint:{x:+n(end.x),y:+n(end.y),...constant,degrees:+n(s.heading??route.heading)}};
      if(finite(s.endHeading))line.endPoint={x:+n(end.x),y:+n(end.y),heading:'linear',startDeg:+n(s.heading),endDeg:+n(s.endHeading)};
      if(s.tangent){line.endPoint={x:+n(end.x),y:+n(end.y),heading:'tangential',reverse:!!s.reverse};}
      if(s.target){line.endPoint.heading='target';line.targetTracking={x:+n(s.target.x),y:+n(s.target.y)};}
      if(s.type==='curve')line.controlPoints=s.points.slice(1,-1).map(p=>({x:+n(p.x),y:+n(p.y)}));
      const path=stops[to[i]]?.path;line.motorPower=path?.power??route.defaultPower??.8;if(path?.kind==='action'){line.actionPath=true;if(path.action)line.actionName=path.action;}
      const l=endsLeg.get(i);if(l){if(l.turn!==null)line.turnAfterDegrees=+n(l.turn);if(l.wait>0)line.waitAfterMs=Math.round(l.wait*1000);if(l.action)line.waitAfterName=l.action;}
      // The Visualizer's own fields: an atomic path, its heading as an object, a colour per Deck path.
      line.kind='atomic';line.color=COLORS[to[i]%COLORS.length];if(!line.controlPoints)line.controlPoints=[];
      line.heading=s.tangent?{type:'tangential',reverse:!!s.reverse}:s.target?{type:'piecewise',piecewiseHeading:{segments:[{startProgress:0,endProgress:1,interpolationType:'facing-point',parameters:{point:{x:+n(s.target.x),y:+n(s.target.y)}}}]}}:finite(s.endHeading)?{type:'linear',startDeg:+n(s.heading),endDeg:+n(s.endHeading)}:{type:'constant',degrees:+n(s.heading??route.heading)};
      return line;});
    const shapes=(layout.zones||[]).map((z,i)=>({id:z.id,name:`No-go zone ${i+1}`,vertices:options.polygon(z).map(p=>({x:+n(p.x),y:+n(p.y)})),color:'#dc2626',fillColor:'#ef444433'}));
    return JSON.stringify({fileName:`${String(layout.name||'route')}.pp`,version:route.segments.some(s=>s.target)?'deck-sim-2':'deck-sim-1',stopAndTurn:!!(route.nonholonomic||route.turns),timestamp:options.timestamp||new Date().toISOString(),
      field:{type:layout.field||'empty',width:layout.width||144,height:layout.height||144},startPoint:{x:+n(layout.start.x),y:+n(layout.start.y),headingDeg:+n(layout.start.heading),heading:'constant',degrees:+n(layout.start.heading)},lines,shapes},null,2)+'\n';
  }
  return {legs,java,pp,validName,actions,slot,pySlot,where,describe,pathIndex};
});
