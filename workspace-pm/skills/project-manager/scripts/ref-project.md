# 项目管理脚本参数

## feishu-bitable-project.mjs

### add
```
--name "项目名"                        必填
--category work|personal|learning      可选，默认 work
--desc "描述"                          可选
--deadline YYYY-MM-DD                  可选
--note "备注"                          可选
```

### list
```
--status active|paused|completed|archived  可选，默认排除 archived
```

### update
```
--id "记录ID" 或 --name "项目名"          二选一定位
--new-name "新名称"                       可选
--category work|personal|learning         可选
--desc "描述"                             可选
--deadline YYYY-MM-DD                     可选
--status active|paused|completed|archived  可选
--note "备注"                             可选
```

### get
```
--id "记录ID" 或 --name "项目名"          二选一定位
```

## feishu-bitable-deliverable.mjs

### add
```
--name "成果物名"                        必填
--project "项目名|ID"                    可选
--status pending|in_progress|done        可选，默认 pending
--desc "描述"                            可选
```

### list
```
--status pending|in_progress|done        可选
```

### update
```
--id "记录ID" 或 --name "成果物名"        二选一定位
--new-name "新名称"                       可选
--status pending|in_progress|done         可选，done 时自动写入完成时间
--desc "描述"                             可选
```

### get
```
--id "记录ID" 或 --name "成果物名"        二选一定位
```

## feishu-bitable-worklog.mjs

### add
```
--content "工作内容"                     必填
--duration "时长"                        可选，默认 60 分钟
  支持格式: "2小时"、"30分钟"、"1.5小时"、纯数字(分钟)
--date YYYY-MM-DD                        可选，默认今天
--project "项目名|ID"                    可选
--deliverable "成果物名|ID"              可选
```

### list
```
无参数，显示最近 20 条，按日期倒序
```

### report
```
--week last                              生成上周周报
--month last                             生成上月月报
都不传则默认生成上周周报
```
