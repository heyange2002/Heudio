import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackOrder, normalizePlaybackMode, nextPlaybackMode } from '../src/utils/playbackOrder';

test('shuffle visits the whole queue once per round and never repeats at the round boundary',()=>{
 const ids=['a','b','c','d','e'];const order=new PlaybackOrder(()=>0.27);let index=0;
 const first=['a'];for(let i=0;i<4;i++){const next=order.select(ids,index,'shuffle','next');assert.notEqual(next,index);index=next;first.push(ids[index]);}
 assert.equal(new Set(first).size,5);
 for(let round=0;round<5;round++){
  const visited=[];for(let i=0;i<5;i++){const next=order.select(ids,index,'shuffle',i%2?'next':'ended');assert.notEqual(next,index);index=next;visited.push(ids[index]);}
  assert.equal(new Set(visited).size,5);
 }
});
test('previous retraces actual shuffle history and next retraces it forward',()=>{
 const ids=['a','b','c','d'];const order=new PlaybackOrder(()=>0.7);
 const a=0,b=order.select(ids,a,'shuffle','next'),c=order.select(ids,b,'shuffle','ended');
 const previous=order.select(ids,c,'shuffle','previous');assert.equal(previous,b);
 assert.equal(order.select(ids,previous,'shuffle','previous'),a);
 assert.equal(order.select(ids,a,'shuffle','previous'),a);
 assert.equal(order.select(ids,a,'shuffle','next'),b);
 assert.equal(order.select(ids,b,'shuffle','next'),c);
});
test('sequential, repeat-one, empty queue, one song and replacement queues remain valid',()=>{
 const order=new PlaybackOrder(()=>0.2),ids=['a','b','c'];
 assert.equal(order.select(ids,2,'sequential','ended'),0);assert.equal(order.select(ids,0,'sequential','previous'),2);
 assert.equal(order.select(ids,1,'repeat-one','ended'),1);assert.equal(order.select(ids,1,'repeat-one','next'),2);
 assert.equal(order.select(ids,1,'repeat-one','previous'),0);assert.equal(order.select([],0,'shuffle','next'),0);assert.equal(order.select(['a'],0,'shuffle','ended'),0);
 const old=order.select(ids,0,'shuffle','next');assert(old>=0&&old<3);
 assert.equal(order.select(['new','queue'],0,'shuffle','next'),1);
 assert.equal(order.select(ids,0,'sequential','next'),1);
});
test('playback modes cycle predictably and invalid stored preferences restore the default',()=>{
 assert.equal(nextPlaybackMode('sequential'),'shuffle');assert.equal(nextPlaybackMode('shuffle'),'repeat-one');assert.equal(nextPlaybackMode('repeat-one'),'sequential');
 assert.equal(normalizePlaybackMode('shuffle'),'shuffle');assert.equal(normalizePlaybackMode('invalid'),'sequential');
});

test('preloading reserves the actual shuffle successor without advancing history, including at round boundaries', () => {
 const ids = ['a', 'b', 'c', 'd']; const order = new PlaybackOrder(() => 0.37); let current = 0;
 for (let i = 0; i < 20; i++) {
  const next = order.peek(ids, current, 'shuffle');
  assert.notEqual(next, current); assert.equal(order.peek(ids, current, 'shuffle'), next);
  assert.equal(order.select(ids, current, 'shuffle', i % 2 ? 'next' : 'ended'), next);
  assert.equal(order.select(ids, next, 'shuffle', 'previous'), current);
  current = order.select(ids, current, 'shuffle', 'next');
 }
 assert.equal(order.peek(ids, current, 'repeat-one'), current);
 assert.equal(order.select(ids, current, 'repeat-one', 'next'), (current + 1) % ids.length);
 order.peek(ids, current, 'shuffle');
 assert.equal(order.select(['x','y'], 0, 'shuffle', 'ended'), 1);
 assert.equal(order.peek(['x','y'], 1, 'sequential'), 0);
});
