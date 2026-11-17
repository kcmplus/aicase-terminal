"""Extract a whitelisted, replayable fixture. Never copy the original credential-bearing log."""
import argparse, json, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('log');p.add_argument('--output',default='supplier-host/src/mock/log-session.json');a=p.parse_args()
lines=Path(a.log).read_text().splitlines()
def field(line,key):
 m=re.search(r'\b'+key+r': ("(?:[^"\\]|\\.)*"|[\w.]+)',line)
 if not m:return None
 v=m.group(1)
 if v.startswith('"'):return json.loads(v)
 if v=='true':return True
 if v=='false':return False
 if v.replace('.','',1).isdigit():return float(v) if '.' in v else int(v)
 return re.sub(r'(?<!^)(?=[A-Z])','_',v).lower()
info=next(l for l in lines if 'MachineMgr get device info, item: MachineInfo' in l)
machine={k:field(info,k) for k in ['device_id','shop_id','device_num','device_name','h5_base_url']}
rows={};states={};frames=[];current=None
for n,line in enumerate(lines,1):
 timestamp=re.match(r'\[([^]]+)\]',line)
 if not timestamp:continue
 label=None
 if 'OrderItem {' in line:
  item={k:field(line,k) for k in ['trade_no','business_number','order_id','goods_id','model_id','pay_status','print_status','status','slot','amount','pay_amount','required_amount','created_at','payment_at']}
  item['effect_image']='' # Local customer image files were not supplied.
  rows[item['trade_no']]=item
  label='订单快照 '+item['trade_no']+' · '+item['pay_status']+' / '+item['print_status']
  if item['print_status'] not in ['idle','deliver_success']:current=item['trade_no']
  if current==item['trade_no'] and item['status']=='success':current=None
 m=re.search(r'PrintMgr task status changed, item: (\S+), status: (\w+)',line)
 if m and m[1] in rows:
  rows[m[1]]['print_status']=m[2];current=m[1]
  label='打印阶段 '+m[2]
 m=re.search(r'(NetProxy\[diy\]|Gripper|Printer) state changed, state: (\w+)',line)
 if m:
  dtype={'NetProxy[diy]':'netproxy','Gripper':'gripper','Printer':'printer'}[m[1]];states[dtype]={'dtype':dtype,'state':m[2].lower()};label=dtype+' '+m[2].lower()
 if any(x+' start but host or port invalid' in line for x in ['Gripper','Printer']):
  label='日志告警：'+('机械臂' if 'Gripper' in line else '打印机')+'地址/端口无效（未伪造在线事件）'
 if label:
  frames.append({'time':timestamp[1],'line':n,'label':label,'orders':json.loads(json.dumps(list(rows.values()))),'devices':json.loads(json.dumps(states)),'current':current})
result={'source':Path(a.log).name,'machine':machine,'notes':['这是按运行日志重建的浏览器 mock，不是 get_order_list 的原始 IPC 抓包。列表累计保留日志中出现的订单，不能据此推断核心实际保留策略。','枚举从 Rust Debug 写法归一为供应商 TS 契约的小写状态；WebSocket 状态转为模拟 Tauri 通知，并非日志中的原始事件 payload。','日志缺少库存列表和百分比进度；库存模拟返回未记录错误，进度为 null。未提供的客户图片使用占位图。','原日志 print_simulate=true；机械臂和打印机启动时提示 host/port 无效，不能把日志出货成功当作真实硬件完成证明。','二维码使用 example.invalid，保留设备/商家编号用于展示，不连接真实下单。原始密码、Token、联系人、客户图片和本机路径未打包。'],'frames':frames}
Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'Extracted {len(frames)} frames, {len(rows)} orders; credentials excluded.')
