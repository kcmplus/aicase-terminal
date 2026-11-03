import {events,snapshot,type Bridge,type Snapshot} from './domain';
export type View={data:Snapshot|null;loading:boolean;error:string|null;updatedAt:number|null};
function timeout<T>(operation:Promise<T>,milliseconds:number):Promise<T>{
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),milliseconds);operation.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
}
export class TerminalController{
  private stopped=false;private running=false;private generation=0;private initialized=false;private starting=false;
  private subscriptions:Array<()=>void>=[];private timer:ReturnType<typeof setInterval>|undefined;
  private view:View={data:null,loading:true,error:null,updatedAt:null};
  private warning:string|null=null;
  constructor(private bridge:Bridge,private render:(view:View)=>void,private interval=15000,private deadline=10000){}
  private publish(view:View){if(!this.stopped){this.view=view;this.render({...view,error:view.error||this.warning});}}
  async start(){
    if(this.stopped||this.starting||this.initialized)return;
    this.starting=true;
    try{
      // Register before ui_inited: the host may immediately emit loading_finished.
      for(const event of events){
        const pending=this.bridge.listen(event,(payload)=>{
          if(event==='print_warning'){
            const warning=(payload as {warning?:unknown}|null)?.warning;
            this.warning=warning==='none'?null:'print-failed';
            this.publish(this.view);
            void this.refresh();
          }else if(event==='order_print_progress')void this.refresh();
          else this.invalidate();
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
      this.publish({data:null,loading:false,error:'connection-failed',updatedAt:null});
    }finally{this.starting=false;}
  }
  async retry(){if(this.initialized)await this.refresh();else await this.start();}
  private invalidate(){
    this.generation++;
    this.publish({data:null,loading:true,error:null,updatedAt:null});
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
          const [machine,device,options,features,stock,order,progress]=await Promise.all([
            invoke('get_machine_info'),invoke('get_device_info'),invoke('get_setting_options'),invoke('get_setting_option_config'),invoke('get_stock_list'),invoke('get_print_order'),invoke('get_print_progress')]);
          const data=snapshot({machine,device,options,features,stock,order,progress});
          if(current===this.generation)this.publish({data,loading:false,error:null,updatedAt:Date.now()});
        }catch{
          if(current===this.generation)this.publish({data:null,loading:false,error:'connection-failed',updatedAt:null});
        }
      }while(!this.stopped&&current!==this.generation);
    }finally{this.running=false;}
  }
  dispose(){this.stopped=true;this.generation++;clearInterval(this.timer);this.subscriptions.splice(0).forEach(off=>off());}
}
