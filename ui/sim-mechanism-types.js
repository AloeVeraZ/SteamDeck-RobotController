(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckMechanismTypes=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // What a moving part is: a claw, a lift, a turret, a hang hook... Mechanisms that show up on FTC robots (gm0's common
  // mechanisms: intakes, claws, transfers, linear motion and rigging, arms, linkages, turrets, dead wheels; the game
  // years' shooters, hoods, spindexers, buckets, hangs and launchers), on FRC robots (elevators, big pivots, wrists,
  // slapdown intakes, indexers, climbers, swerve) and on robots in general (articulated arms, SCARA, gantries, legs,
  // grippers, pan-tilt heads, steering, pneumatics). Sources are in docs/MECHANISM_RESEARCH.md.
  // A type is a starting point for a joint (DeckKinematics): how it moves, which way, its named positions, how fast,
  // the motor that usually drives it, and the words a CAD assembly named for it uses. Nothing here is required: a
  // joint's own settings always win, and the team can pick another type or change any setting.
  //   joint     revolute (pivots), continuous (spins), prismatic (slides)
  //   axis      the pivot or slide direction on the robot: side (left–right), up, forward (front–back)
  //   find      how the finder locates it in a CAD: hinge, slide, spin (round parts on an axle), yaw (a turntable),
  //             claw (its fingers), wheel (left to the drive wheel finder)
  //   positive  which way positive turns move it from its CAD pose: raise (arms, hooks) or lower (drop-down intakes)
  //   piece     it can be one CAD part (a gate, a hood); otherwise a single part named for it is one of its pieces
  //   family    types that nest as one mechanism: a "Viper slide" inside a "Lift" is part of the lift
  //   signal    the game signal it can follow when the game's mechanisms are on (rollers spin while intaking)
  const GROUPS=[['intake','Intakes and claws'],['inside','Moving pieces inside'],['lift','Lifts and slides'],['arm','Arms and linkages'],['score','Shooters and scoring'],
    ['endgame','Hanging and endgame'],['drive','Drivetrain and odometry'],['sense','Cameras and sensors'],['robot','Robot arms, legs and machines'],['custom','Your own']];
  const servo={kind:'servo'},crservo={kind:'crservo'},gearbox=r=>({kind:'gearbox',ratio:r}),spool=d=>({kind:'spool',diameter:d}),belt=(a,b)=>({kind:'belt',driver:a,driven:b});
  const motor=(...transmission)=>({kind:'dcmotor',transmission});
  const T=(id,group,name,joint,o)=>({id,group,name,joint,axis:'side',find:joint==='prismatic'?'slide':joint==='continuous'?'spin':'hinge',family:id,...o});
  // Named positions are in degrees for pivots and spins, inches for slides; speeds are degrees or inches a second.
  // Spinning parts keep their rpm for the game's signals and a "run" position (a few turns) for route actions.
  const LIST=[
    // ---- intakes and claws
    T('roller-intake','intake','Roller intake','continuous',{rpm:400,states:{stop:0,run:2160},speed:2400,signal:'roller',motor:motor(gearbox(3.7)),
      words:'\\bintake\\b|\\broller(?:s|\\s?bar)?\\b|sweeper|brush ?roll|gecko|compliant ?wheel|flex ?wheel|surgical ?tub(?:e|ing)|star ?wheel|active ?intake|\\bsucker\\b',
      blurb:'Spinning rollers, wheels or tubing that pull pieces in off the floor.'}),
    T('deploy-intake','intake','Drop-down intake','revolute',{states:{up:0,down:90},lower:0,upper:150,speed:240,positive:'lower',motor:servo,
      words:'(?:slap|drop) ?-?down(?: ?intake)?|deploy(?:able|ing|er)?(?: ?intake)?|flip ?-?(?:out|down)(?: ?intake)?|intake ?(?:pivot|arm|deploy|lift|tilt|wrist|flip)|pivot(?:ing)? ?intake|over ?-?the ?-?bumper(?: ?intake)?|\\botb\\b(?: ?intake)?|(?:four|4) ?-?bar ?intake',
      blurb:'An intake that swings down to the floor to pick up and back up to hand over (slapdown, over the bumper).'}),
    T('claw','intake','Claw','revolute',{states:{open:0,closed:25},speed:360,find:'claw',motor:servo,
      words:'\\bclaws?\\b|grabber|\\bgrab\\b|pincer|pinch(?:er)?|\\bclamp\\b|gripper|\\bgrip\\b|\\bjaws?\\b|end ?-?effector',
      blurb:'Fingers that close on a piece, usually on a servo. Its fingers are found by name (finger, jaw, pincer).'}),
    T('parallel-gripper','intake','Parallel gripper','prismatic',{axis:'side',states:{open:0,closed:1},lower:0,upper:2,speed:4,motor:servo,
      words:'parallel ?(?:gripper|jaws?|claw)|linear ?(?:gripper|claw)|jaw ?gripper|two ?-?finger ?gripper',
      blurb:'Jaws that slide straight toward each other.'}),
    T('roller-claw','intake','Roller claw','continuous',{rpm:300,states:{stop:0,run:1800},speed:1800,signal:'roller',motor:crservo,
      words:'roller ?claw|active ?claw|intake ?claw|spinning ?claw|wheel(?:ed)? ?claw|roller ?grabber',
      blurb:'A claw with spinning wheels that pull a piece in and spit it out.'}),
    T('wrist','intake','Wrist','revolute',{states:{down:0,up:90},speed:360,positive:'raise',piece:true,motor:servo,
      words:'\\bwrist(?: ?(?:pitch|tilt|pivot))?\\b|claw ?(?:pitch|tilt|pivot)',
      blurb:'Tilts a claw or intake at the end of an arm.'}),
    T('wrist-roll','intake','Wrist roll (twist)','revolute',{axis:'forward',states:{flat:0,turned:90},speed:360,family:'wrist-roll',motor:servo,
      words:'wrist ?(?:roll|rotat(?:e|ion|or)|twist|spin|turn)|claw ?(?:roll|rotat(?:e|ion|or)|twist|spin)|rotat(?:ing|or) ?(?:claw|wrist)|\\btwister\\b|roll ?joint',
      blurb:'Turns a claw about its own length to line up with a piece.'}),
    T('diffy-wrist','intake','Differential wrist','revolute',{states:{down:0,up:90},speed:360,positive:'raise',family:'wrist',motor:servo,
      words:'diff(?:erential|y) ?wrist|\\bdiffy\\b|bevel ?(?:gear ?)?wrist',
      blurb:'Two servos through bevel gears: turning them together tilts it, against each other rolls it. This part is the tilt; add a Wrist roll inside it for the roll.'}),
    T('bucket','intake','Bucket or dumper','revolute',{states:{hold:0,dump:120},speed:300,piece:true,motor:servo,
      words:'bucket|\\bdump(?:er|ing)?\\b|basket|\\bscoop\\b|\\btray\\b|deposit(?:or)?|\\bbin\\b',
      blurb:'Holds pieces and tips them out to score.'}),
    // ---- moving pieces inside the robot
    T('kicker','inside','Kicker or flicker','revolute',{states:{rest:0,kick:60},speed:720,piece:true,motor:servo,
      words:'\\bkick(?:er|ing)?\\b|\\bflick(?:er)?\\b|\\bpush(?:er)?\\b|\\btapper\\b|\\bpaddle\\b|plunger|ejector',
      blurb:'Swings or pushes a piece: into the shooter, out of the robot, off the intake.'}),
    T('transfer','inside','Transfer arm','revolute',{states:{intake:0,transfer:180},speed:360,motor:servo,
      words:'\\btransfer(?: ?(?:arm|flip|bucket))?\\b|\\bflipper\\b|pass ?-?through|hand ?-?off',
      blurb:'Flips a piece from the intake over to the scoring mechanism.'}),
    T('conveyor','inside','Conveyor or belt','continuous',{rpm:300,states:{stop:0,run:1800},speed:1800,signal:'feeder',motor:motor(gearbox(5.2)),
      words:'conveyor|(?:feed|intake|transfer|vertical|storage) ?belts?\\b|belt ?(?:feed|conveyor|system)|tread ?(?:intake|conveyor)',
      blurb:'Belts or tread that carry pieces through the robot.'}),
    T('spindexer','inside','Spindexer or carousel','continuous',{axis:'up',states:{slot1:0,slot2:120,slot3:240},speed:360,find:'yaw',motor:servo,
      words:'spin ?-?dex(?:er)?|\\bcarousel\\b(?! ?(?:spinner|wheel))|revolver|rotary ?(?:index(?:er)?|magazine|sorter)|\\bsorter\\b|cylinder ?magazine',
      blurb:'A turning drum with a slot per piece that indexes them to the shooter.'}),
    T('gate','inside','Gate, door or flap','revolute',{states:{closed:0,open:90},speed:360,piece:true,motor:servo,
      words:'\\bgate\\b|\\bdoor\\b|\\bflap\\b|\\blid\\b|stopper|blocker|\\bhatch\\b|shutter',
      blurb:'Opens to let pieces through and closes to hold them.'}),
    T('feeder','inside','Feeder wheels','continuous',{rpm:600,states:{stop:0,run:3600},speed:3600,signal:'feeder',motor:motor(gearbox(1)),
      words:'\\bfeeder\\b|feed ?(?:wheel|roller)s?|index(?:er|ing)? ?(?:wheel|roller)s?|\\buptake\\b|kicker ?wheels?|transfer ?(?:wheel|roller)s?',
      blurb:'Wheels that push a piece into the shooter.'}),
    // ---- lifts and slides
    T('lift','lift','Lift or elevator','prismatic',{axis:'up',states:{down:0,up:24},lower:0,upper:30,speed:30,family:'slide',motor:motor(gearbox(5.2),spool(1.4)),
      words:'\\blift\\b|elevator|vertical ?(?:slides?|lift|extension)|cascade|continuous ?rig(?:ging)?|\\bmast\\b|\\btower\\b|outtake ?slides?|linear ?lift',
      blurb:'Slides that carry a mechanism straight up, strung continuous or cascade.'}),
    T('linear-slide','lift','Linear slide (extension)','prismatic',{axis:'forward',states:{in:0,out:18},lower:0,upper:24,speed:40,family:'slide',motor:motor(gearbox(5.2),spool(1.4)),
      words:'\\bslides?\\b|\\bextension\\b|\\bextend(?:o|er)\\b|telescop(?:e|ic|ing)|drawer ?slides?|misumi|\\bviper\\b|linear ?(?:rail|slide|extension|motion)|horizontal ?(?:slides?|extension|lift)',
      blurb:'Drawer, extrusion or bearing slides that reach out (an extendo), strung with a spool.'}),
    T('scissor-lift','lift','Scissor lift','prismatic',{axis:'up',states:{down:0,up:18},lower:0,upper:24,speed:10,family:'slide',motor:motor(gearbox(19.2),{kind:'screw',lead:.315}),
      words:'scissor(?: ?(?:lift|jack|mechanism))?',blurb:'Crossed links that push straight up.'}),
    T('lead-screw','lift','Lead screw or linear actuator','prismatic',{axis:'forward',states:{in:0,out:6},lower:0,upper:12,speed:2,family:'slide',motor:{kind:'linear'},
      words:'lead ?-?screw|linear ?actuator|actuonix|ball ?-?screw|power ?screw|threaded ?rod|acme ?(?:screw|rod)',
      blurb:'A turning screw that pushes a nut along it: slow, strong and holds without power.'}),
    T('rack-pinion','lift','Rack and pinion slide','prismatic',{axis:'forward',states:{in:0,out:10},lower:0,upper:16,speed:20,family:'slide',motor:motor(gearbox(13.7),{kind:'rack',diameter:1}),
      words:'rack ?(?:and|&|n|-)? ?pinion(?: ?(?:slides?|extension|lift))?|rack ?(?:slide|extension|drive)',blurb:'A gear driving a toothed bar along its rails.'}),
    T('linkage-slide','lift','Linkage extension','prismatic',{axis:'forward',states:{in:0,out:12},lower:0,upper:18,speed:30,family:'slide',motor:servo,
      words:'linkage ?(?:slides?|extension|extendo|extend(?:er)?)|crank ?(?:slide|extension)|two ?-?bar ?linkage',
      blurb:'A servo-driven two-bar linkage that pushes slides out.'}),
    T('dr4b','lift','Double reverse four-bar','prismatic',{axis:'up',states:{down:0,up:16},lower:0,upper:24,speed:20,family:'slide',motor:motor(gearbox(50.9)),
      words:'(?:double ?-?reverse(?: ?(?:four|4) ?-?bar)?|\\bdr ?4 ?b\\b|reverse ?(?:four|4) ?-?bar)(?: ?lift)?',
      blurb:'Two four-bars stacked so the top moves straight up. Drawn here as its straight-up motion.'}),
    // ---- arms and linkages
    T('arm','arm','Arm (pivot)','revolute',{states:{down:0,up:90},speed:120,positive:'raise',piece:true,motor:motor(gearbox(50.9),belt(20,60)),
      words:'\\barms?\\b|^pivot$|big ?pivot|shoulder|\\bboom\\b|swing ?arm|scoring ?arm|outtake ?arm|upper ?arm',
      blurb:'A pivot that swings a mechanism up and over: a big pivot, a scoring arm.'}),
    T('pivot-extension','arm','Pivoting slide','revolute',{states:{down:0,up:90},speed:90,positive:'raise',family:'arm',then:'linear-slide',motor:motor(gearbox(50.9),belt(20,60)),
      words:'pivot(?:ing)? ?(?:slides?|extension|lift)|(?:slides?|extension|lift) ?pivot|tilt(?:ing)? ?(?:slides?|lift)',
      blurb:'Slides on a pivot: the pivot aims them and the slides reach. The slides inside it ride on it.'}),
    T('elbow','arm','Elbow (second arm joint)','revolute',{states:{straight:0,bent:90},speed:120,positive:'raise',family:'elbow',piece:true,motor:servo,
      words:'\\belbow\\b|forearm|lower ?arm|second ?(?:arm|stage) ?(?:joint|pivot)',blurb:'The joint between the two halves of a two-jointed arm.'}),
    T('four-bar','arm','Four-bar linkage','revolute',{states:{down:0,up:90},speed:120,positive:'raise',family:'arm',motor:servo,
      words:'(?:four|\\b4) ?-?bar|parallelogram|parallel ?(?:arm|linkage)|\\blinkage\\b',
      blurb:'Two parallel bars that keep the end level as it swings in an arc. Pin the coupler to close the loop.'}),
    T('v4b','arm','Virtual four-bar','revolute',{states:{down:0,up:180},speed:240,positive:'raise',family:'arm',motor:servo,
      words:'virtual ?(?:four|4) ?-?bar|\\bv ?-?4 ?-?b\\b',blurb:'An arm whose end stays level through a belt or chain, with more than 180° of travel.'}),
    // ---- shooters and scoring
    T('flywheel','score','Flywheel shooter','continuous',{rpm:3000,states:{stop:0,run:3600},speed:18000,signal:'flywheel',motor:motor(gearbox(1)),
      words:'fly ?-?wheel|\\bshoot(?:er|ing)?(?: ?wheel)?\\b|launch(?:er|ing)? ?wheel|\\bcannon\\b|blaster|\\blauncher\\b|rhino ?wheel',
      blurb:'A fast wheel that launches pieces.'}),
    T('hood','score','Adjustable hood','revolute',{states:{low:0,high:20},speed:120,piece:true,motor:servo,
      words:'\\bhood\\b|shooter ?(?:angle|pitch)|launch ?angle',blurb:'The curved plate over a flywheel; tilting it changes the launch angle.'}),
    T('turret','score','Turret','revolute',{axis:'up',states:{front:0,left:90,right:-90},lower:-180,upper:180,speed:240,find:'yaw',motor:motor(gearbox(13.7),belt(20,100)),
      words:'turret|turn ?-?table|lazy ?susan|slew(?:ing)? ?(?:ring|bearing)|yaw ?(?:base|mount|plate)|rotat(?:ing|ion) ?base',
      blurb:'Turns a mechanism side to side to aim without turning the robot.'}),
    T('mini-turret','score','Mini turret (end effector yaw)','revolute',{axis:'up',states:{center:0,left:45,right:-45},speed:360,find:'yaw',family:'turret',motor:servo,
      words:'mini ?-?turret|claw ?turret|end ?-?effector ?turret|wrist ?yaw|yaw ?joint',blurb:'A small servo turret at the end of an extension that turns the claw.'}),
    T('catapult','score','Catapult','revolute',{states:{cocked:0,fired:100},speed:900,motor:motor(gearbox(19.2)),
      words:'catapult|trebuchet|launch ?arm|puncher|slingshot',blurb:'An arm that swings fast to throw a piece.'}),
    T('drone-launcher','score','Spring launcher (drone or plane)','revolute',{states:{locked:0,released:45},speed:720,piece:true,motor:servo,
      words:'\\bdrone(?: ?launch(?:er)?)?\\b|(?:paper ?)?(?:air)?plane ?launch(?:er)?|spring ?launch(?:er)?|launch(?:er)? ?(?:latch|release|trigger|lock)|\\btrigger\\b',
      blurb:'A latch that a servo releases to fire a spring or rubber band.'}),
    T('spinner','score','Spinner (carousel wheel)','continuous',{rpm:200,states:{stop:0,run:1800},speed:1200,motor:crservo,
      words:'(?:carousel|duck) ?spinner|\\bspinner\\b|carousel ?wheel',blurb:'A wheel pressed against a field element to turn it.'}),
    // ---- hanging and endgame
    T('hang-hook','endgame','Hang hook or climber','revolute',{states:{stowed:0,raised:90},speed:120,positive:'raise',piece:true,motor:motor(gearbox(50.9)),
      words:'\\bhooks?\\b|\\bhang(?:er|ing)?\\b|climb(?:er|ing)?|ascen(?:t|d|der)|pull ?-?up|rung ?(?:grab|hook)',
      blurb:'Hooks raised to a bar or rung, then pulled down to lift the robot.'}),
    T('winch','endgame','Winch or spool','continuous',{states:{out:0,in:1080},speed:360,motor:motor(gearbox(50.9)),
      words:'\\bwinch\\b|\\bspools?\\b|\\breel\\b|capstan|tether',blurb:'Winds up a cable or strap to pull the robot up.'}),
    T('ratchet','endgame','Brake, lock or ratchet','revolute',{states:{free:0,locked:20},speed:360,piece:true,motor:servo,
      words:'ratchet|\\bpawl\\b|\\bbrake\\b|\\block(?:ing)?\\b|\\blatch\\b|detent',blurb:'Locks a lift or hang in place so it holds without power.'}),
    // ---- drivetrain and odometry
    T('drive-wheel','drive','Drive wheel','continuous',{find:'wheel',signal:'wheel',
      words:'(?:drive|mecanum|omni|traction|tank) ?wheels?|\\bmecanum\\b|omni ?-?wheel|\\btire\\b|\\btyre\\b',blurb:'Rolls with the robot as it drives.'}),
    T('swerve-steer','drive','Swerve steering','continuous',{axis:'up',states:{forward:0,left:90},speed:720,find:'yaw',motor:crservo,
      words:'\\bswerve(?: ?module)?\\b|steer(?:ing)? ?(?:module|pod|servo|gear)|azimuth|module ?yaw',blurb:'Turns a swerve module’s wheel to point it.'}),
    T('odometry-pod','drive','Odometry pod (dead wheel)','continuous',{find:'wheel',signal:'wheel',
      words:'odo(?:metry)? ?(?:pod|wheel)s?|dead ?-?wheels?|tracking ?wheels?|encoder ?wheels?',blurb:'An unpowered wheel with an encoder that measures how far the robot moved.'}),
    T('odo-retract','drive','Retracting odometry','revolute',{states:{down:0,up:30},speed:240,positive:'raise',motor:servo,
      words:'odo(?:metry)? ?(?:lift|retract(?:or|ion)?|raise|lifter)|retract(?:able|ing)? ?odo(?:metry)?|pod ?lift',blurb:'Lifts the odometry pods off the floor (to climb or cross a barrier).'}),
    // ---- cameras and sensors
    T('camera-mount','sense','Camera pan or tilt','revolute',{states:{level:0,down:20},speed:180,motor:servo,
      words:'camera ?(?:mount ?)?(?:pan|tilt|servo|gimbal|pivot)|pan ?-?tilt|gimbal|webcam ?(?:pan|tilt)|sensor ?(?:arm|flip|pivot)',blurb:'Points a camera or sensor.'}),
    // ---- robot arms, legs and machines
    T('base-yaw','robot','Base or waist (arm)','revolute',{axis:'up',states:{front:0,left:90,right:-90},lower:-170,upper:170,speed:90,find:'yaw',family:'turret',motor:motor(gearbox(100)),
      words:'\\bwaist\\b|base ?(?:yaw|rotat(?:e|ion|or)|joint|turn(?:er)?)|swivel(?: ?base)?|rotary ?base',blurb:'The first joint of an articulated arm, turning it about the vertical.'}),
    T('scara','robot','SCARA joint','revolute',{axis:'up',states:{home:0,reach:90},speed:180,find:'yaw',motor:{kind:'stepper'},
      words:'\\bscara(?: ?(?:arm|joint|link))?\\b',blurb:'A pivot with an upright axis, as in a SCARA arm’s links.'}),
    T('gantry','robot','Gantry or linear stage','prismatic',{axis:'forward',states:{home:0,end:12},lower:0,upper:24,speed:10,family:'slide',motor:{kind:'stepper',transmission:[belt(20,20),spool(.5)]},
      words:'\\bgantry\\b|cartesian|linear ?(?:stage|axis)|\\b[xyz] ?-?axis\\b',blurb:'A carriage driven along a rail by a belt or screw (one axis of a Cartesian robot).'}),
    T('hip','robot','Hip (leg)','revolute',{states:{stand:0,step:30},speed:180,motor:servo,words:'\\bhips?\\b|\\bthigh\\b|\\bfemur\\b|\\bcoxa\\b',blurb:'Swings a leg.'}),
    T('knee','robot','Knee (leg)','revolute',{states:{straight:0,bent:60},speed:180,motor:servo,words:'\\bknees?\\b|\\bshin\\b|\\btibia\\b',blurb:'Bends a leg.'}),
    T('ankle','robot','Ankle or foot','revolute',{states:{flat:0,tilt:20},speed:180,piece:true,motor:servo,words:'\\bankles?\\b|\\bfoot\\b|\\bfeet\\b|\\btarsus\\b',blurb:'Tilts a foot.'}),
    T('neck','robot','Head pan or tilt (neck)','revolute',{axis:'up',states:{center:0,left:45,right:-45},speed:180,find:'yaw',motor:servo,words:'\\bneck\\b|head ?(?:pan|tilt|yaw|turn)',blurb:'Turns a robot’s head.'}),
    T('finger','robot','Finger (robot hand)','revolute',{states:{open:0,closed:80},speed:240,piece:true,family:'claw',motor:servo,words:'\\bfingers?\\b|\\bthumb\\b|knuckle|phalan(?:x|ges)',blurb:'One finger of a hand or gripper.'}),
    T('steering','robot','Steering (car-like)','revolute',{axis:'up',states:{straight:0,left:25,right:-25},lower:-35,upper:35,speed:180,find:'yaw',motor:servo,
      words:'ackermann|steer(?:ing)? ?(?:knuckle|arm|rack|link(?:age)?)|kingpin|\\bsteering\\b',blurb:'Turns the front wheels of a car-like robot.'}),
    T('piston','robot','Pneumatic piston','prismatic',{axis:'forward',states:{in:0,out:4},lower:0,upper:4,speed:40,family:'slide',motor:{kind:'pneumatic',response:'pneumatic'},
      words:'pneumatic|\\bpiston\\b|air ?cylinder',blurb:'An air cylinder that pushes out and pulls in, resting at its ends.'}),
    T('spindle','robot','Spinning tool (spindle or drill)','continuous',{axis:'forward',rpm:1000,states:{stop:0,run:3600},speed:6000,motor:{kind:'bldc'},
      words:'\\bspindle\\b|\\bdrill\\b|screwdriver|grinder|polisher|sander',blurb:'A tool that spins at the end of an arm.'}),
    T('propeller','robot','Propeller or thruster','continuous',{axis:'up',rpm:5000,states:{stop:0,run:3600},speed:12000,motor:{kind:'bldc'},
      words:'propell?er|thruster|\\brotor\\b|impeller',blurb:'Spins to push air or water (drones, underwater robots).'}),
    // ---- your own
    T('custom-pivot','custom','Something that pivots','revolute',{states:{up:0,down:45},speed:90,piece:true,family:'custom-pivot',blurb:'Any other part that turns on a hinge.'}),
    T('custom-slide','custom','Something that slides','prismatic',{axis:'forward',states:{in:0,out:6},lower:0,upper:12,speed:10,family:'custom-slide',blurb:'Any other part that slides along rails.'}),
    T('custom-spin','custom','Something that spins','continuous',{states:{stop:0,run:1800},speed:600,family:'custom-spin',blurb:'Any other part that spins on an axle.'})];
  const TYPES=Object.fromEntries(LIST.map(t=>[t.id,t]));
  for(const t of LIST)if(t.words)t.re=new RegExp(t.words,'gi');
  // ---------------------------------------------------------------- reading a CAD name
  // Vendor catalogue parts ("48mm Gecko Wheel - 15A (GB)", "3614 Series Rhino Wheel (14mm Bore…)") are pieces of a
  // mechanism, not mechanisms; the team names its own assemblies.
  const VENDOR=/\b\d{4}-\d{2,4}\b|\((?:GB|AXON|SWYFT|ELC|REV|AM)\)|\bREX\b|\bbore\b|durometer|\b\d+(?:\.\d+)?\s?mm\b|\bseries\b|\bv\d+:\d+|__body|\bkit\b|\bpack\b/i;
  // Hardware named for the mechanism it belongs to ("Arm motor mount", "Claw servo", "4BAR HEX", "Turret gear") is a
  // piece of it, as is a servo's own arm ("Servo arm").
  const HARDWARE=/^[\s\-_:()]*(?:motors?|servos?|gear(?:box|s)?|pinions?|pulleys?|sprockets?|bearings?|bushings?|brackets?|mounts?|mounting|plates?|bars?\b|screws?|bolts?|nuts?|spacers?|standoffs?|shafts?|axles?|hex|channels?|extrusions?|tubes?|tubing|belts?|chains?|encoders?|sensors?|hubs?|horns?|cables?|wires?|strings?|springs?|blocks?|pins?|collars?|links?\b|inserts?|covers?|guards?|stops?\b|washers?|rods?\b|rails?\b|stages?\b|spools?\b|pads?\b|tips?\b|tensioners?|clips?\b|boxes?\b|wheels?\b|drives?\b|transmissions?|gearing|pivots?\b|hinges?\b)/i;
  const BEFORE=/(?:servo|motor)\s*$/i;
  const tidy=name=>String(name||'').replace(/\s*<\d+>$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/\s+/g,' ').trim();
  // The type a CAD name says, or null. The name's last mechanism word wins ("Intake slides" is a slide, "Claw wrist" a
  // wrist), a longer phrase over a shorter one ending at the same place ("Intake arm" is a drop-down intake, not an
  // arm). Vendor parts and hardware named after a mechanism say nothing. Returns {id, word}.
  function detect(name,{vendor=false}={}){
    const text=tidy(name);if(!text||!vendor&&VENDOR.test(String(name||'')))return null;let best=null;
    for(const t of LIST){if(!t.re)continue;t.re.lastIndex=0;for(const m of text.matchAll(t.re)){const word=m[0].trim();if(!word)continue;const end=m.index+m[0].length;
      if(HARDWARE.test(text.slice(end))||BEFORE.test(text.slice(0,m.index)))continue;const score=end*1000+word.length;if(!best||score>best.score)best={id:t.id,word,score};}}
    return best&&{id:best.id,word:best.word};
  }
  // The type of a joint: the one it was given, else one its game signal stands for.
  const BY_SIGNAL={turret:'turret',hood:'hood',flywheel:'flywheel',roller:'roller-intake',deploy:'deploy-intake',feeder:'feeder',wheel:'drive-wheel',steer:'swerve-steer'};
  function of(j){if(j?.kind&&TYPES[j.kind])return TYPES[j.kind];const s=j?.drive?.signal;return s&&BY_SIGNAL[s]?TYPES[BY_SIGNAL[s]]:null;}
  // ---------------------------------------------------------------- a joint of a type
  // The robot directions as CAD directions: rows are the CAD's forward, left and up (DeckRobotModel.rows).
  function direction(t,rows){const [F,L,U]=rows||[[1,0,0],[0,1,0],[0,0,1]];return (t.axis==='up'?U:t.axis==='forward'?F:L).slice();}
  // The settings a type gives a joint: how it moves, its positions and speed. Spinning parts follow the game's signal
  // when `bind` names one (the game's mechanisms are on); otherwise route actions move them, like every other type.
  function settings(id,{bind=null}={}){
    const t=TYPES[id]||TYPES['custom-pivot'],out={kind:t.id,type:t.joint,states:{...(t.states||{})},speed:t.speed??90};
    if(Number.isFinite(t.lower))out.lower=t.lower;if(Number.isFinite(t.upper))out.upper=t.upper;if(Number.isFinite(t.rpm))out.rpm=t.rpm;
    if(t.signal==='wheel')out.drive={signal:'wheel'};else if(bind)out.drive=bind;else out.drive={signal:'action'};
    if(out.drive.signal!=='action'){delete out.states;delete out.speed;}
    return out;
  }
  // A joint of a type with the given geometry; the rest from the type.
  function joint(id,{id:jid,name,origin=[0,0,0],axis,rows,parts=[],parent=null,bind=null,...rest}={}){
    const t=TYPES[id]||TYPES['custom-pivot'];return {id:jid,name:name||t.name,...settings(t.id,{bind}),parent,parts,origin,axis:axis||direction(t,rows),source:'user',...rest};
  }
  // Another type for a joint the team already has: its geometry (parts, pivot, parent) stays; how it moves, its
  // positions and speed come from the new type. A slide stays a slide's direction; a pivot keeps its axis.
  function retype(j,id,{rows,bind=null}={}){
    const t=TYPES[id];if(!t||j.kind===id)return j;const fresh=settings(id,{bind}),next={...j,...fresh};
    for(const k of ['lower','upper','rpm','launch','zero','roll','states','speed'])if(!(k in fresh))delete next[k];
    if(!j.parts?.length&&rows)next.axis=direction(t,rows);
    return next;
  }
  // The motor a type is usually driven by, for "Add its motor": its kind, gearing and how it moves.
  function motorFor(id){const m=TYPES[id]?.motor;if(!m)return {kind:'dcmotor'};return {kind:m.kind,...(m.transmission?{transmission:m.transmission.map(s=>({...s}))}:{}),...(m.response?{response:m.response}:{})};}
  const grouped=()=>GROUPS.map(([id,name])=>({id,name,types:LIST.filter(t=>t.group===id)}));
  // A new part's name, for route actions ("Lift up", "Claw open"): the type's first words.
  const short=t=>t.group==='custom'?'Moving part':t.name.split(/,| or |\s\(/)[0].trim();
  // Whether a name already says the type ("Hood · shooter 1" is a hood), so the panel need not.
  const says=(t,name)=>!!t&&(tidy(name).toLowerCase().includes(short(t).toLowerCase())||!!t.words&&new RegExp(t.words,'i').test(tidy(name)));
  return {GROUPS,LIST,TYPES,detect,tidy,of,settings,joint,retype,motorFor,direction,grouped,short,says,VENDOR,HARDWARE};
});
