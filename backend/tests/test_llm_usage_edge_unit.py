"""Exercise the real Edge Function aggregation with a local fake database."""

import json
from pathlib import Path
import shutil
import subprocess

import pytest


def test_daily_aggregation_preserves_cached_and_thinking_tokens():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required for the Edge Function harness")
    source = Path(__file__).parents[1] / "app/edge_functions/llm-usage.js"
    harness = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let selected = '';
const rows = [
  {ts:'2026-09-04T01:00:00Z',feature:'test',model:'gemini-3.8-flash',prompt_tokens:100,output_tokens:20,cached_tokens:40,thoughts_tokens:30,total_tokens:150},
  {ts:'2026-09-04T02:00:00Z',feature:'test',model:'gemini-3.8-flash',prompt_tokens:50,output_tokens:10,cached_tokens:null,thoughts_tokens:5,total_tokens:65},
];
const query = {select(fields){selected=fields;return this;}, async gte(){return {data:rows,error:null};}};
const sandbox = {module:{exports:{}},Response,URL,Date,Map,
  Deno:{env:{get(key){return key==='EDGE_FUNCTION_SECRET' ? 'unit-secret' : '';}}},
  createClient(){return {database:{from(){return query;}}};},
};
vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),sandbox);
(async()=>{
  const result=await sandbox.module.exports(new Request('https://unit.test/llm-usage?action=daily&days=30', {headers:{'X-Internal-Secret':'unit-secret'}}));
  assert.equal(result.status,200);
  const data=await result.json();
  assert.ok(selected.includes('thoughts_tokens') && selected.includes('cached_tokens'));
  assert.equal(data.summary.length,1);
  assert.equal(data.summary[0].calls,2);
  assert.equal(data.summary[0].cached_tokens,40);
  assert.equal(data.summary[0].thoughts_tokens,35);
  assert.equal(data.summary[0].output_tokens,30);
  process.stdout.write(JSON.stringify({success:true}));
})().catch(e=>{process.stderr.write(String(e));process.exit(1);});
"""
    result = subprocess.run([node, "-e", harness, str(source)], capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)["success"]
