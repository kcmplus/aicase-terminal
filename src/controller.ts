import {events,snapshot,deviceStateUpdate,emptyDeviceStates,type Bridge,type Snapshot} from './domain';
export type View={data:Snapshot|null;loading:boolean;error:string|null;updatedAt:number|null;warning?:string|null};
function timeout<T>(operation:Promise<T>,milliseconds:number):Promise<T>{
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),milliseconds);operation.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
export class TerminalController{
  private stopped=false;private running=false;private generation=0;private initialized=false;private starting=false;
  private subscriptions:Array<()=>void>=[];private timer:ReturnType<typeof setInterval>|undefined;
  private view:View={data:null,loading:true,error:null,updatedAt:null};
  private warning:string|null=null;
  private devices=emptyDeviceStates();
  private retryTimer:ReturnType<typeof setTimeout>|undefined;
  constructor(private bridge:Bridge,private render:(view:View)=>void,private interval=15000,private deadline=10000){}
  private publish(view:View){if(!this.stopped){this.view=view;this.render({...view,warning:this.warning});}}
  async start(){
    if(this.stopped||this.starting||this.initialized)return;
    clearTimeout(this.retryTimer);this.starting=true;
    try{
      // Register before ui_inited: the host may immediately emit loading_finished.
      for(const event of events){
        const pending=this.bridge.listen(event,(payload)=>{
          if(this.stopped)return;
          if(event==='device_state_changed'){
            const update=deviceStateUpdate(payload);
            if(!Object.keys(update).length)return;
            this.devices={...this.devices,...update};
            this.publish({...this.view,data:this.view.data?{...this.view.data,devices:{...this.devices}}:null});
          }else if(event==='print_warning'){
            const warning=(payload as {warning?:unknown}|null)?.warning;
            this.warning=warning==='none'?null:typeof warning==='string'?warning:'unknown';
            this.publish(this.view);
            void this.refresh();
          }else if(event==='order_print_progress')void this.refresh();
          else {
            this.invalidate(!['machine_info_changed','setting_options_changed','setting_configs_changed','setting_lock_changed'].includes(event));
          }
        });
        let accepted=false;
        try{const off=await timeout(pending,this.deadline);accepted=true;if(this.stopped){off();return;}this.subscriptions.push(off);}
        catch(error){void pending.then(off=>{if(!accepted)off();},()=>{});throw error;}
      }
      await timeout(this.bridge.invoke('ui_inited'),this.deadline);
      if(this.stopped)return;
      this.initialized=true;
      this.timer=setInterval(()=>{void this.refresh();},this.interval);
      await this.refresh();
    }catch{
      this.subscriptions.splice(0).forEach(off=>off());
      this.devices=emptyDeviceStates();
      this.publish({data:null,loading:false,error:'connection-failed',updatedAt:null});
      if(!this.stopped)this.retryTimer=setTimeout(()=>{void this.start();},this.interval);
    }finally{this.starting=false;}
  }
  async retry(){if(this.initialized)await this.refresh();else await this.start();}
  private invalidate(keepDisplay=false){
    this.generation++;
    this.publish({data:keepDisplay?this.view.data:null,loading:true,error:null,updatedAt:keepDisplay?this.view.updatedAt:null});
    if(this.initialized)void this.refresh();
  }
  async refresh(){
    if(this.stopped||!this.initialized||this.running)return;
    this.running=true;
    try{
      let current:number;
      do{
        current=this.generation;
        try{
          const invoke=(command:Parameters<Bridge['invoke']>[0])=>timeout(this.bridge.invoke(command),this.deadline);
          // Progress has no trade_no. Bracket the read to avoid attaching it to a different job.
          const printRead=async()=>{
            const before=await invoke('get_print_order');
            const progress=await invoke('get_print_progress');
            const order=await invoke('get_print_order');
            const first=(before as {trade_no?:unknown}|null)?.trade_no;
            const last=(order as {trade_no?:unknown}|null)?.trade_no;
            return {order,progress:typeof first==='string'&&first===last?progress:null};
          };
          const [machine,options,features,stock,printing,orders]=await Promise.all([
            invoke('get_machine_info'),invoke('get_setting_options'),invoke('get_setting_option_config'),invoke('get_stock_list'),printRead(),invoke('get_order_list').catch(()=>null)]);
          const {order,progress}=printing;
          const data=snapshot({machine,options,features,stock,order,progress,orders});
          data.devices={...this.devices};
          if(current===this.generation)this.publish({data,loading:false,error:null,updatedAt:Date.now()});
        }catch{
          if(current===this.generation)this.publish({data:null,loading:false,error:'connection-failed',updatedAt:null});
        }
      }while(!this.stopped&&current!==this.generation);
    }finally{this.running=false;}
  }
  dispose(){this.stopped=true;this.generation++;clearInterval(this.timer);clearTimeout(this.retryTimer);this.subscriptions.splice(0).forEach(off=>off());}
}
