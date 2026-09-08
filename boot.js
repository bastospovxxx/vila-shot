/* Vila RP emergency boot: keeps GitHub Pages from ever showing a black screen.
   The full game (js/main.js) takes over as soon as it starts successfully. */
(function(){
  var c=document.getElementById('game'); if(!c) return;
  var x=c.getContext('2d');
  var started=performance.now(), stop=false;
  function size(){c.width=Math.max(1,innerWidth*devicePixelRatio);c.height=Math.max(1,innerHeight*devicePixelRatio);c.style.width='100%';c.style.height='100%';x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
  size(); addEventListener('resize',size);
  function draw(){
    if(window.VILA_GAME_READY) { stop=true; return; }
    var w=innerWidth,h=innerHeight,t=(performance.now()-started)/1000;
    x.fillStyle='#4f96d2';x.fillRect(0,0,w,h);
    x.fillStyle='rgba(255,255,255,.18)';
    for(var i=0;i<8;i++){var cx=((i*260-t*12)%(w+320))-160,cy=80+(i%3)*55;x.fillRect(cx,cy,105,13);x.fillRect(cx+24,cy-10,45,23)}
    var base=Math.floor(h*.64);
    for(var i=0;i<Math.ceil(w/24)+2;i++){
      var sx=i*24, top=base-Math.floor(Math.sin(i*.55)*12+Math.sin(i*1.7)*7);
      x.fillStyle='#6b9f4e';x.fillRect(sx,top,25,24);
      x.fillStyle='#80552f';x.fillRect(sx,top+24,25,h-top-24);
      for(var yy=top+48;yy<h;yy+=24){x.fillStyle=(yy%48===0?'#68727c':'#59636e');x.fillRect(sx,yy,25,24)}
    }
    x.fillStyle='#e9bd76';x.fillRect(w/2-9,base-48,18,18);x.fillStyle='#4d83d0';x.fillRect(w/2-11,base-30,22,30);
    x.fillStyle='#101a28';x.fillRect(16,16,300,42);x.fillStyle='#fff';x.font='900 18px system-ui';x.fillText('VILA RP',28,43);
    x.font='12px system-ui';x.fillText('Carregando o mundo...',140,43);
    x.fillStyle='#101a28';x.fillRect(w/2-160,h-70,320,42);x.fillStyle='#fff';x.font='13px system-ui';x.fillText('Preparando mundo online • aguarde',w/2-125,h-44);
    requestAnimationFrame(draw);
  }
  draw();
})();
