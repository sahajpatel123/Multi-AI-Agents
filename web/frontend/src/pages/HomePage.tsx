import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { setRedirectIntent } from '../utils/redirectIntent';
import '../styles/verdict-home.css';

type Answer = { name: string; model: string; copy: string; score: number; reason: string; color: string };
type Scene = { question: string; winner: number; answers: Answer[] };

const SCENES: Scene[] = [
  {
    question: 'Should advanced AI be treated as critical infrastructure?', winner: 3,
    answers: [
      { name: 'Analyst', model: 'DeepSeek V4 Flash', copy: 'Without measurable thresholds, “critical infrastructure” becomes a moat for incumbents.', score: 84, reason: 'DEFINITION TOO BLUNT', color: '#5ED8FF' },
      { name: 'Philosopher', model: 'GPT-4o', copy: 'The trigger is not capability alone, but the degree to which society depends on it.', score: 87, reason: 'REFRAMES THE THRESHOLD', color: '#A98CF8' },
      { name: 'Contrarian', model: 'Grok', copy: 'Safety rules may freeze today’s leaders in place while pretending to restrain them.', score: 82, reason: 'EXPOSES THE INCENTIVE', color: '#FF6652' },
      { name: 'Engineer', model: 'DeepSeek V4 Flash', copy: 'Regulate deployment choke points: compute, access, and incident reporting—not weights.', score: 91, reason: 'MOST ACTIONABLE', color: '#D7F64A' },
    ],
  },
  {
    question: 'Should a startup raise big now or stay lean?', winner: 0,
    answers: [
      { name: 'Analyst', model: 'DeepSeek V4 Flash', copy: 'Capital before proven unit economics funds assumptions, not growth.', score: 92, reason: 'NAMES THE HIDDEN RISK', color: '#5ED8FF' },
      { name: 'Philosopher', model: 'GPT-4o', copy: 'The real question is what kind of company the founders intend to become.', score: 86, reason: 'QUESTIONS THE PREMISE', color: '#A98CF8' },
      { name: 'Pragmatist', model: 'GPT-4o mini', copy: 'Raise only when one unit of spend reliably returns more than one in durable revenue.', score: 90, reason: 'CLEAR DECISION RULE', color: '#D7F64A' },
      { name: 'Contrarian', model: 'Grok', copy: 'In a winner-take-most market, staying lean can be under-ambition with better PR.', score: 80, reason: 'CHALLENGES CONSENSUS', color: '#FF6652' },
    ],
  },
  {
    question: 'Is a four-day work week actually better?', winner: 2,
    answers: [
      { name: 'Scientist', model: 'DeepSeek V4 Flash', copy: 'Evidence supports retained output in some knowledge teams, not a universal effect.', score: 89, reason: 'HONEST ABOUT EVIDENCE', color: '#5ED8FF' },
      { name: 'Economist', model: 'DeepSeek V4 Flash', copy: 'The policy works when coordination costs fall faster than available hours.', score: 85, reason: 'TRACES THE INCENTIVE', color: '#A98CF8' },
      { name: 'Pragmatist', model: 'GPT-4o mini', copy: 'Run it for six weeks and keep it only if cycle time and defects hold.', score: 93, reason: 'TESTABLE IN PRACTICE', color: '#D7F64A' },
      { name: 'Empath', model: 'Claude Sonnet', copy: 'Predictable time changes who can remain in the workforce.', score: 88, reason: 'SEES HUMAN IMPACT', color: '#FF6652' },
    ],
  },
];

const PERSONAS = [
  ['The Analyst', 'I find the flaw in everything.', '#5ED8FF'], ['The Philosopher', 'I question the premise first.', '#A98CF8'],
  ['The Pragmatist', 'I only care what works.', '#D7F64A'], ['The Contrarian', 'I say what no one else will.', '#FF6652'],
  ['The Scientist', 'Evidence first. Then inference.', '#45D1CF'], ['The Historian', 'Every pattern has a precedent.', '#F0B84E'],
  ['The Economist', 'Incentives explain behavior.', '#53E0B2'], ['The Ethicist', 'Who bears the cost?', '#B58EFF'],
  ['The Stoic', 'Control what can be controlled.', '#A0A39A'], ['The Futurist', 'What follows after that?', '#62B8FF'],
  ['The Strategist', 'Where is the leverage?', '#FF9368'], ['The Engineer', 'What breaks first?', '#BEEB4A'],
  ['The Optimist', 'Name the mechanism for good.', '#E4F477'], ['The Empath', 'Who is missing from the frame?', '#FF86A2'],
  ['First Principles', 'Strip it to bedrock.', '#64E0C4'], ["Devil's Advocate", 'Steelman the opposite.', '#FF705E'],
] as const;

const AUDIT = [
  { name: 'RELEVANCE', score: '9.4', color: '#5ED8FF', quote: 'Regulate deployment choke points: compute, access, and incident reporting—not weights.', why: 'Directly answers what should be regulated and replaces an abstract category with actionable boundaries.', gap: 'The answer does not yet define where each threshold should begin.' },
  { name: 'INSIGHT', score: '9.1', color: '#A98CF8', quote: 'The useful unit of regulation is where capability becomes deployable power.', why: 'Separates possessing a model from controlling a consequential deployment.', gap: 'The distinction weakens when deployment has no central operator.' },
  { name: 'CLARITY', score: '9.6', color: '#D7F64A', quote: 'Compute. Access. Incident reporting. Three observable intervention points.', why: 'Turns a broad policy argument into three concrete objects.', gap: 'Brevity leaves their relationship underexplained.' },
  { name: 'HONESTY', score: '8.3', color: '#FF6652', quote: 'Regulate the choke points—but only where thresholds can be measured and appealed.', why: 'Acknowledges the risk of entrenching incumbents.', gap: 'It understates cross-jurisdiction enforcement uncertainty.' },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(mq.matches); update(); mq.addEventListener('change', update); return () => mq.removeEventListener('change', update); }, []);
  return reduced;
}

export function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const instrumentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const answerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selected, setSelected] = useState(3);
  const [locked, setLocked] = useState(false);
  const [auditIndex, setAuditIndex] = useState(0);
  const [claimIndex, setClaimIndex] = useState(0);
  const [panel, setPanel] = useState([0, 1, 2, 3]);
  const [personaHover, setPersonaHover] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const scene = SCENES[sceneIndex];
  const active = scene.answers[selected] ?? scene.answers[scene.winner];
  const audit = AUDIT[auditIndex];

  const enterArena = () => {
    if (isAuthenticated) { navigate('/app'); return; }
    setRedirectIntent('/app');
    navigate('/signin?tab=signup');
  };

  const changeScene = (next: number) => {
    const index = (next + SCENES.length) % SCENES.length;
    setSceneIndex(index); setSelected(SCENES[index].winner); setLocked(false); setSeconds(0);
  };

  useEffect(() => { const id = window.setInterval(() => setSeconds((v) => (v + 1) % 60), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); } }), { threshold: 0.14 });
    root.querySelectorAll('.vp-reveal').forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current, hero = heroRef.current, instrument = instrumentRef.current;
    if (!canvas || !hero || !instrument) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let raf = 0, pointerX = 0.5, pointerY = 0.5;
    const start = performance.now();
    const resize = () => { const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, innerWidth < 760 ? 1.5 : 2); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const partial = (a: {x:number;y:number}, b: {x:number;y:number}, t: number) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (b.x-a.x)*t, a.y + (b.y-a.y)*t); ctx.stroke(); };
    const draw = (time: number) => {
      const cr = canvas.getBoundingClientRect(), ir = instrument.getBoundingClientRect(), mobile = innerWidth <= 820;
      ctx.clearRect(0, 0, cr.width, cr.height); ctx.fillStyle = 'rgba(243,240,231,.08)';
      for (let i=0;i<90;i++) ctx.fillRect((i*173)%Math.max(1,cr.width),(i*97)%Math.max(1,cr.height),1,1);
      const ox=ir.left-cr.left, oy=ir.top-cr.top, w=ir.width, h=ir.height, progress=reduced?1:Math.min(1,(time-start)/3100);
      const prism=mobile?{x:ox+w*.5,y:oy+h*.35}:{x:ox+w*.29,y:oy+h*.52};
      const input=mobile?{x:ox+w*.5,y:oy+h*.17}:{x:ox,y:oy+h*.48};
      const judgeEl=rootRef.current?.querySelector('.vp-judge') as HTMLElement | null;
      const jr=judgeEl?.getBoundingClientRect(); const lens=mobile?{x:ox+w*.5,y:oy+h*.79}:{x:(jr?.left??cr.width*.9)-cr.left+(jr?.width??120)/2,y:(jr?.top??cr.height*.6)-cr.top+(jr?.height??120)/2};
      const nodes=mobile?[.2,.4,.6,.8].map((x,i)=>({x:ox+w*x,y:oy+h*(.45+i*.04)})):answerRefs.current.map((el,i)=>{const r=el?.getBoundingClientRect();return{x:(r?.left??cr.width*(.43+i*.05))-cr.left-8,y:(r?.top??cr.height*.5)-cr.top+(r?.height??50)/2}});
      ctx.lineCap='square'; ctx.strokeStyle='#F3F0E7';ctx.lineWidth=2;partial(input,prism,Math.min(1,progress*4));
      const ps=mobile?24:35;ctx.fillStyle='#050604';ctx.strokeStyle='#F3F0E7';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(prism.x,prism.y-ps);ctx.lineTo(prism.x+ps,prism.y);ctx.lineTo(prism.x,prism.y+ps);ctx.lineTo(prism.x-ps,prism.y);ctx.closePath();ctx.fill();ctx.stroke();
      nodes.forEach((node,i)=>{const p1=Math.max(0,Math.min(1,(progress-.15)*2.1)),p2=Math.max(0,Math.min(1,(progress-.5)*2.1)),end={x:lens.x+(pointerX-.5)*5,y:lens.y+(pointerY-.5)*8};ctx.strokeStyle=scene.answers[i].color;ctx.globalAlpha=i===selected?1:.5;ctx.lineWidth=i===selected?4:2;partial(prism,node,p1);partial(node,end,p2);if(progress>.3&&!reduced){const phase=(time*.00018+i*.23)%1, target=phase<.56?node:end, source=phase<.56?prism:node, local=phase<.56?phase/.56:(phase-.56)/.44;for(let k=3;k>=0;k--){const q=Math.max(0,local-k*.045),x=source.x+(target.x-source.x)*q,y=source.y+(target.y-source.y)*q,size=6-k;ctx.globalAlpha=(1-k*.2)*(i===selected?1:.65);ctx.fillStyle=scene.answers[i].color;ctx.fillRect(x-size/2,y-size/2,size,size)}}});ctx.globalAlpha=1;
      raf=requestAnimationFrame(draw);
    };
    const move=(e:PointerEvent)=>{pointerX=e.clientX/innerWidth;pointerY=e.clientY/innerHeight};
    resize(); addEventListener('resize',resize);hero.addEventListener('pointermove',move);raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);removeEventListener('resize',resize);hero.removeEventListener('pointermove',move)};
  }, [scene, selected, reduced]);

  const claims = useMemo(() => [
    ['compute access', 'Compute controls can build a moat for incumbents.', 'Tie obligations to measurable training scale and review the boundary.'],
    ['deployment permissions', 'Licensing gives rule-makers power to choose which rivals exist.', 'Base permission on reach, reversibility, and access to critical systems.'],
    ['incident reporting', 'Reporting after harm is already too late.', 'Near-miss reporting creates the dataset needed before public failure.'],
  ], []);

  const assignPersona = (index: number) => { setPersonaHover(index); if (!panel.includes(index)) setPanel((current) => [...current.slice(1), index]); };

  return (
    <div className="vp-home" ref={rootRef}>
      <Navbar />

      <main>
        <section className="vp-hero" ref={heroRef}>
          <canvas ref={canvasRef} aria-hidden="true" />
          <div className="vp-hero-copy">
            <div className="vp-hero-title">
              <h1>ASK ONCE.<br/><span>THINK FOUR WAYS.</span></h1>
            </div>
            <div className="vp-hero-intro">
              <p>One question enters. Four distinct minds expose what a single answer would miss. A fifth judges the evidence.</p>
              <button onClick={enterArena}>PUT A QUESTION IN <ArrowRight /></button>
            </div>
          </div>
          <div className="vp-instrument" ref={instrumentRef}>
            <div className="vp-live"><i/><b>LIVE RESOLUTION</b><span>QUESTION 00{sceneIndex+1}</span><time>00:{String(seconds).padStart(2,'0')}</time><div><button onClick={()=>changeScene(sceneIndex-1)} aria-label="Previous"><ChevronLeft/></button><span>0{sceneIndex+1} / 03</span><button onClick={()=>changeScene(sceneIndex+1)} aria-label="Next"><ChevronRight/></button></div></div>
            <label className="vp-question"><span>THE QUESTION</span><textarea value={scene.question} readOnly rows={2}/><button onClick={()=>changeScene(sceneIndex+1)} aria-label="Run next question"><ArrowRight/></button></label>
            <div className="vp-prism-label">QUESTION<br/>ENTERS</div>
            <div className="vp-mobile-tabs">{scene.answers.map((answer,i)=><button key={answer.name} style={{'--tone':answer.color} as React.CSSProperties} className={i===selected?'active':''} onClick={()=>{setSelected(i);setLocked(true)}}>0{i+1}</button>)}</div>
            {scene.answers.map((answer,i)=><button key={answer.name} ref={(node)=>{answerRefs.current[i]=node}} className={`vp-answer vp-answer-${i+1} ${i===selected?'active':''}`} style={{'--tone':answer.color} as React.CSSProperties} onPointerEnter={()=>!locked&&setSelected(i)} onPointerLeave={()=>!locked&&setSelected(scene.winner)} onClick={()=>{setSelected(i);setLocked(true)}}><span>0{i+1} · {answer.name} / {answer.model}</span><strong>{answer.copy}</strong><small>SCORE {answer.score}</small></button>)}
            <div className="vp-judge"><small>JUDGE 05</small><b>{active.score}</b><strong>{active.name}</strong><em>{active.reason}</em></div>
            <div className="vp-judge-links"><a href="#debate">DEBATE THIS ↗</a><a href="#minds">FOCUS ↘</a></div>
          </div>
          <a href="#method" className="vp-next">FOLLOW THE QUESTION THROUGH THE GLASS ↓</a>
        </section>

        <section className="vp-paper vp-section" id="method"><div className="vp-wrap"><header className="vp-section-head vp-reveal"><div><small>01 / THE METHOD</small><h2>A verdict you can inspect.</h2></div><p>Arena preserves disagreement, then makes the judgment visible.</p></header><div className="vp-method vp-reveal"><article><small>INPUT / 00</small><b>ONE<br/>QUESTION</b></article><article><small>PARALLEL / 01—04</small><b>FOUR MINDS<br/>DISAGREE</b><div><i/><i/><i/><i/></div></article><article><small>JUDGMENT / 05</small><b>ONE<br/>VERDICT</b></article></div><div className="vp-three vp-reveal"><article><h3>Difference is designed.</h3><p>Each mind is selected for a distinct reasoning style.</p></article><article><h3>The score is visible.</h3><p>Relevance, insight, clarity, and honesty remain inspectable.</p></article><article><h3>The winner is not the end.</h3><p>Challenge a claim or continue privately with one mind.</p></article></div></div></section>

        <section className="vp-paper vp-section" id="audit"><div className="vp-wrap"><header className="vp-section-head vp-reveal"><div><small>02 / SCORING AUDIT</small><h2>The verdict has receipts.</h2></div><p>The fifth mind does not hide behind one number. Inspect what earned—or cost—every point.</p></header><div className="vp-audit vp-reveal"><div className="vp-dial"><small>JUDGE 05 / COMPOSITE</small><div><b>91</b><span>ENGINEER<br/>WINNER</span></div><p>Strongest because the answer converts a broad question into measurable intervention points.</p></div><div className="vp-audit-main"><div className="vp-metrics">{AUDIT.map((metric,i)=><button key={metric.name} className={i===auditIndex?'active':''} style={{'--tone':metric.color,'--score':`${Number(metric.score)*10}%`} as React.CSSProperties} onClick={()=>setAuditIndex(i)}><small>0{i+1}</small><b>{metric.name}</b><span>{metric.score}</span></button>)}</div><article style={{'--tone':audit.color} as React.CSSProperties}><small>EVIDENCE / {audit.name} / {audit.score}</small><blockquote>“{audit.quote}”</blockquote><div><p><b>WHY IT SCORED</b>{audit.why}</p><p><b>WHAT HELD IT BACK</b>{audit.gap}</p></div></article></div></div></div></section>

        <section className="vp-dark vp-section" id="debate"><div className="vp-wrap"><header className="vp-section-head vp-reveal"><div><small>03 / AFTER THE VERDICT</small><h2>Don’t accept it.<br/>Test it.</h2></div><p>The judge chooses. You remain in control.</p></header><div className="vp-debate vp-reveal"><small>WINNING ANSWER / THE ENGINEER / 91</small><p>Regulate the places where harm can be controlled: {claims.map((claim,i)=><button className={i===claimIndex?'active':''} key={claim[0]} onClick={()=>setClaimIndex(i)}>{claim[0]}</button>)}—not the impossible-to-contain idea of a model itself.</p><div><article><small>DEBATE / THE CONTRARIAN</small><h3>“{claims[claimIndex][1]}”</h3></article><article><small>FOCUS / THE ENGINEER</small><h3>“{claims[claimIndex][2]}”</h3></article></div></div></div></section>

        <section className="vp-paper vp-section" id="minds"><div className="vp-wrap"><header className="vp-section-head vp-reveal"><div><small>04 / PERSONA LIBRARY</small><h2>Build the spectrum.</h2></div><p>Agreement is cheap. Choose minds that fail differently.</p></header><div className="vp-personas vp-reveal"><div className="vp-persona-quote" style={{color:`${PERSONAS[personaHover][2]}30`}}>“{PERSONAS[personaHover][1]}”</div><div>{PERSONAS.map((persona,i)=><button key={persona[0]} className={panel.includes(i)?'selected':''} style={{'--tone':persona[2]} as React.CSSProperties} onMouseEnter={()=>setPersonaHover(i)} onFocus={()=>setPersonaHover(i)} onClick={()=>assignPersona(i)}>{persona[0]}<small>{String(i+1).padStart(2,'0')}</small></button>)}</div><footer>{panel.map((index,i)=><div key={i}><small>SLOT 0{i+1}</small><b style={{color:PERSONAS[index][2]}}>{PERSONAS[index][0]}</b></div>)}</footer></div></div></section>

        <section className="vp-tape"><header><span>LIVE DECISION TAPE / QUESTION TYPES</span><span>FOUR MINDS → ONE VERDICT</span></header><div>{[0,1].flatMap(group=>[['STRATEGY','Should we enter the market now or wait for certainty?','STRATEGIST','92'],['CAREER','Is leaving a safe role brave—or impulsive?','PRAGMATIST','89'],['PRODUCT','Does this feature solve a problem or decorate it?','ANALYST','94'],['POLICY','Who carries the cost if this decision scales?','ETHICIST','91']].map((item,i)=><article key={`${group}-${i}`} aria-hidden={group===1}><small>{item[0]}</small><p>“{item[1]}”</p><span>WINNER / {item[2]} <b>{item[3]}</b></span></article>))}</div></section>

        <section className="vp-dark vp-section" id="agent-mode"><div className="vp-wrap"><header className="vp-section-head vp-reveal"><div><small>05 / AGENT MODE</small><h2>For questions that cannot end in one pass.</h2></div><p>A multi-stage pipeline plans, investigates, attacks its own logic, verifies what survives, and refines what does not.</p></header><div className="vp-pipeline vp-reveal">{[['PLAN','Break the question into evidence-bearing tasks.'],['RESEARCH','Gather sources and preserve disagreement.'],['SOLVE','Build the strongest supported answer.'],['CRITIQUE','Find hidden assumptions and weak links.'],['VERIFY','Check load-bearing claims against sources.'],['SYNTHESIZE','Merge the strongest supported findings.'],['JUDGE','Calibrate evidence and uncertainty into one report.']].map((step,i)=><article key={step[0]}><small>0{i+1}</small><i/><h3>{step[0]}</h3><p>{step[1]}</p></article>)}</div><div className="vp-pipeline-cta"><p>Not a longer answer. A harder-to-fool process.</p><button onClick={()=>navigate(isAuthenticated?'/agent':'/signin?tab=signup')}>RUN AN INVESTIGATION <ArrowRight/></button></div></div></section>

        <section className="vp-close"><div className="vp-wrap"><small>YOUR QUESTION / NEXT</small><h2 className="vp-reveal">WHAT DESERVES MORE THAN ONE ANSWER?</h2><form onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();enterArena()}}><input aria-label="Your question" placeholder="Put it in the arena…"/><button aria-label="Enter Arena"><ArrowRight/></button></form><footer><span>3 RUNS FREE · NO CARD REQUIRED</span><span>ARENA © 2026 · MULTIPLE MINDS. ONE VERDICT.</span></footer></div></section>
      </main>
    </div>
  );
}
