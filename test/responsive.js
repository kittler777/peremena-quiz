const selector=document.querySelector('#width'),frame=document.querySelector('iframe');
const initial=new URLSearchParams(location.search).get('width');if(['360','390','768','1440'].includes(initial))selector.value=initial;
function resize(){frame.style.width=selector.value+'px';document.title='Подпиши это! — экран '+selector.value+' px';}
selector.addEventListener('change',resize);resize();
