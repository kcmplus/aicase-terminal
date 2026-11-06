import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import ts from 'typescript';
import {events} from '../src/domain.ts';
import {DEFAULT_EXTERNAL_PAYMENT_TYPE} from '../src/order-api.ts';

// Parse the unmodified supplier files; importing them would execute Tauri code and
// depend on the supplier's missing @/common/logger implementation.
const directory=new URL('../docs/vendor-api/',import.meta.url);
const files=readdirSync(directory).filter(name=>name.endsWith('.ts')).map(name=>ts.createSourceFile(name,readFileSync(new URL(name,directory),'utf8'),ts.ScriptTarget.Latest,true));
const functions=new Map<string,ts.FunctionDeclaration>();const enums=new Map<string,Set<string>>();
for(const file of files)for(const node of file.statements){
 if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node);
 if(ts.isEnumDeclaration(node))enums.set(node.name.text,new Set(node.members.flatMap(member=>member.initializer&&ts.isStringLiteral(member.initializer)?[member.initializer.text]:[])));
}
const source=ts.createSourceFile('domain.ts',readFileSync(new URL('../src/domain.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);

test('every live display command is a matching zero-argument supplier invoke',()=>{
 const command=source.statements.find(node=>ts.isTypeAliasDeclaration(node)&&node.name.text==='Command') as ts.TypeAliasDeclaration;
 assert.ok(ts.isUnionTypeNode(command.type));
 const names=command.type.types.map(node=>{assert.ok(ts.isLiteralTypeNode(node)&&ts.isStringLiteral(node.literal));return node.literal.text;});
 assert.equal(names.length,9);
 for(const name of names){
  const definition=functions.get(name);assert.ok(definition,`Supplier command missing: ${name}`);assert.equal(definition.parameters.length,0);
  let matchingInvoke=false;
  const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='invoke'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===name)matchingInvoke=true;ts.forEachChild(node,visit);};
  visit(definition);assert.ok(matchingInvoke,`IPC name mismatch: ${name}`);
 }
});
test('all subscribed events and the agreed free payment value exist in the original ZIP contract',()=>{
 const declared=new Set([...enums].filter(([name])=>name.endsWith('Event')).flatMap(([,values])=>[...values]));
 for(const event of events)assert.ok(declared.has(event),`Unknown supplier event: ${event}`);
 assert.ok(enums.get('PayType')?.has(DEFAULT_EXTERNAL_PAYMENT_TYPE));
});
test('payment adapter matches supplier argument names and string payment type',()=>{
 const definition=functions.get('select_order_payment')!;
 assert.deepEqual(definition.parameters.map(parameter=>parameter.name.getText()),['trade_no','pay_type']);
 assert.equal(definition.parameters[1].type?.kind,ts.SyntaxKind.StringKeyword);
});
