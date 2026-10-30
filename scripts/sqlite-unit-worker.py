import sys,json,sqlite3,pathlib
db=sqlite3.connect(':memory:',isolation_level=None)
db.row_factory=sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
for path in sorted(pathlib.Path('db/migrations').glob('*.sql')):
    db.executescript(path.read_text(encoding='utf-8'))
    if path.name.startswith('0018_'):
        db.execute("INSERT INTO tasks(id,name,person,status,date,priority,project,hours,custom,assignees,group_id) VALUES('migration-check','Before images',-1,-1,'','','',NULL,'{}','[]','todo')")
        db.execute("INSERT INTO task_updates(id,task_id,author_id,body,created_at,updated_at) VALUES('migration-update','migration-check',NULL,'Preserved content',1,1)")
    if path.name.startswith('0022_'):
        db.execute("INSERT INTO tasks(id,name,status,group_id) VALUES('completed-migration-check','Completed before automation',2,'todo')")
        db.execute("INSERT INTO tasks(id,name,status,group_id,parent_id) VALUES('completed-child-check','Unfinished child',-1,'todo','completed-migration-check')")
assert db.execute("SELECT body FROM task_updates WHERE id='migration-update'").fetchone()[0]=='Preserved content'
db.execute("DELETE FROM tasks WHERE id='migration-check'")
assert db.execute("SELECT group_id FROM tasks WHERE id='completed-migration-check'").fetchone()[0]=='done'
assert tuple(db.execute("SELECT group_id,status FROM tasks WHERE id='completed-child-check'").fetchone())==('done',-1)
db.execute("DELETE FROM tasks WHERE id='completed-migration-check'")
print(json.dumps({'ready':True}),flush=True)
for line in sys.stdin:
    message=json.loads(line)
    try:
        queries=message['queries']; results=[]
        if message.get('batch'): db.execute('BEGIN')
        for query in queries:
            before=db.total_changes
            cursor=db.execute(query['sql'],query.get('params',[]))
            rows=[dict(row) for row in cursor.fetchall()] if cursor.description else []
            results.append({'results':rows,'meta':{'changes':db.total_changes-before},'success':True})
        if message.get('batch'): db.execute('COMMIT')
        output={'id':message['id'],'result':results}
    except Exception as error:
        if db.in_transaction: db.execute('ROLLBACK')
        output={'id':message['id'],'error':str(error)}
    print(json.dumps(output,ensure_ascii=True),flush=True)
