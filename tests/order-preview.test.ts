import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSource} from '../src/order-preview.ts';
import {orderQueue} from '../src/queue.ts';
import {fixture} from '../src/preview.ts';

test('previews preserve signed HTTP URLs and convert absolute native image paths',()=>{
 assert.equal(previewSource('https://images.example/p.png?token=a%2Bb'),'https://images.example/p.png?token=a%2Bb');
 const paths:string[]=[];const convertLocal=(path:string)=>{paths.push(path);return 'asset://localhost/image';};
 for(const path of ['/data/orders/case.png','C:\\orders\\case.webp'])assert.equal(previewSource(path,{convertLocal}),'asset://localhost/image');
 assert.deepEqual(paths,['/data/orders/case.png','C:\\orders\\case.webp']);
 assert.equal(previewSource('/data/orders/case.png'),null);
});
test('unsupported or unsafe sources stay placeholders instead of triggering host conversion',()=>{
 const convertLocal=()=>{throw Error('unexpected conversion');};
 for(const value of [null,'','javascript:alert(1)','file:///etc/passwd','data:image/svg+xml,hello','//external.example/p.png','https://user:pass@example.com/a.png','/data/../secret.png','/data/config.json','bad\npath.png','relative.png'])assert.equal(previewSource(value,{convertLocal}),null);
 assert.equal(previewSource('/data/p.png',{convertLocal:()=>{throw Error('asset disabled');}}),null);
});
test('demo images require explicit development base; missing effects never expose print originals',()=>{
 assert.equal(previewSource('/preview-images/ocean.webp'),null);
 assert.equal(previewSource('/preview-images/ocean.webp',{demoBase:'http://127.0.0.1:4180/'}),'http://127.0.0.1:4180/preview-images/ocean.webp');
 const row=(fixture('printing').get_order_list as any[])[0];
 const parsed=orderQueue([{...row,effect_image:null,target_image:'private-print-original.png'}])[0];
 assert.equal(parsed.previewImage,'');assert.ok(!JSON.stringify(parsed).includes('private-print-original'));
 assert.equal(orderQueue([{...row,effect_image:'https://images.example/preview.png'}])[0].previewImage,'https://images.example/preview.png');
});
