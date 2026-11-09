'use strict';
/* ---------- 영역 캡처: 깨지는 수식·그래프를 이미지로 저장 ----------
   PDF 위에서 사각형을 드래그하면 그 부분을 잘라 하이라이트 목록에 넣는다. */
function pvCapInit(p){
  var b=$('#pvCap'),sc=$('#pvs');if(!b||!sc)return;
  var on=false,st=null,rc=null;
  function mode(v){on=v;b.setAttribute('aria-pressed',on);b.textContent=on?'캡처 끄기':'영역 캡처';sc.classList.toggle('capmode',on)}
  b.addEventListener('click',function(){mode(!on)});
  sc.addEventListener('mousedown',function(e){
    if(!on||e.button!==0)return;var box=e.target.closest&&e.target.closest('.pgbox');if(!box)return;
    e.preventDefault();var bb=box.getBoundingClientRect();
    st={box:box,x:e.clientX-bb.left,y:e.clientY-bb.top,bb:bb};
    rc=document.createElement('div');rc.className='caprect';box.appendChild(rc);
  });
  document.addEventListener('mousemove',function(e){
    if(!st)return;var bb=st.bb;
    var x=Math.max(0,Math.min(bb.width,e.clientX-bb.left)),y=Math.max(0,Math.min(bb.height,e.clientY-bb.top));
    rc.style.left=Math.min(st.x,x)+'px';rc.style.top=Math.min(st.y,y)+'px';rc.style.width=Math.abs(x-st.x)+'px';rc.style.height=Math.abs(y-st.y)+'px';
    st.ex=x;st.ey=y;
  });
  document.addEventListener('mouseup',function(){
    if(!st)return;var s=st;st=null;if(rc){rc.remove();rc=null}
    if(s.ex==null)return;
    var x=Math.min(s.x,s.ex),y=Math.min(s.y,s.ey),w=Math.abs(s.ex-s.x),h=Math.abs(s.ey-s.y);
    if(w<14||h<14)return;
    var cv=s.box.querySelector('canvas');if(!cv)return;
    var r=cv.width/s.bb.width,out=document.createElement('canvas'),k=Math.min(1,720/(w*r));
    out.width=Math.max(1,Math.round(w*r*k));out.height=Math.max(1,Math.round(h*r*k));
    out.getContext('2d').drawImage(cv,x*r,y*r,w*r,h*r,0,0,out.width,out.height);
    var img=out.toDataURL('image/png');if(img.length>260000)img=out.toDataURL('image/jpeg',.85);
    var page=+s.box.dataset.n;
    p.hl=p.hl||[];p.hl.push({id:nid('h'),page:page,text:'',img:img,kind:'그래프·표',mine:'',rects:[[x/s.bb.width,y/s.bb.height,w/s.bb.width,h/s.bb.height]]});
    save();drawHl(p,page);drawHlList();mode(false);
    if(!S.example&&S.saved===false)toast('저장 공간이 부족해 캡처가 새로고침 후 사라질 수 있어요');
  });
}

/* ---------- PDF 위의 하이라이트·캡처를 눌러서 바로 지우기 ---------- */
function pvDelHl(p,h){
  function del(){p.hl=(p.hl||[]).filter(function(x){return x.id!==h.id});save();drawHl(p,h.page);drawHlList()}
  if(h.img)ask('이 캡처를 삭제할까요?','저장한 이미지와 "내가 이해한 것"이 함께 사라져요.','삭제',del,true);else del();
}
function pvHitInit(p){
  var sc=$('#pvs');if(!sc)return;
  function rm(){var b=$('#hldel');if(b)b.remove()}
  sc.addEventListener('mousedown',function(e){
    if(!e.target.closest||!e.target.closest('#hldel'))rm();
    var tl=e.target.closest&&e.target.closest('.textLayer');if(tl)tl.classList.add('selecting');
  });
  document.addEventListener('mouseup',function(){$$('.textLayer.selecting').forEach(function(t){t.classList.remove('selecting')})});
  sc.addEventListener('scroll',rm);
  sc.addEventListener('click',function(e){
    rm();if(sc.classList.contains('capmode'))return;
    var sel=window.getSelection();if(sel&&!sel.isCollapsed)return;
    var box=e.target.closest&&e.target.closest('.pgbox');if(!box)return;
    var bb=box.getBoundingClientRect(),fx=(e.clientX-bb.left)/bb.width,fy=(e.clientY-bb.top)/bb.height,n=+box.dataset.n,best=null,ba=1e9,tol=.004;
    (p.hl||[]).forEach(function(h){
      if(h.page!==n)return;
      (h.rects||[]).forEach(function(r){
        if(fx>=r[0]-tol&&fx<=r[0]+r[2]+tol&&fy>=r[1]-tol&&fy<=r[1]+r[3]+tol&&r[2]*r[3]<ba){ba=r[2]*r[3];best=h}
      });
    });
    if(!best)return;
    var bar=document.createElement('div');bar.id='hldel';bar.className='hlbar';
    bar.innerHTML='<button type="button">'+(best.img?'캡처 삭제':'하이라이트 삭제')+'</button>';
    document.body.appendChild(bar);
    var w=bar.offsetWidth;bar.style.left=Math.max(8,Math.min(window.innerWidth-w-8,e.clientX-w/2))+'px';bar.style.top=Math.min(window.innerHeight-48,e.clientY+10)+'px';
    bar.addEventListener('mousedown',function(ev){ev.preventDefault();ev.stopPropagation()});
    bar.querySelector('button').addEventListener('click',function(){rm();pvDelHl(p,best)});
  });
}
